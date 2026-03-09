// src/controllers/helpdesk/tickets.controller.ts
import type { Request, Response } from "express";
import { prisma } from "../../lib/prisma.js";
import { TicketStatus, TicketPriority, TicketEventType, TicketActorType, MessageDirection } from "@prisma/client";
import type { Prisma } from "@prisma/client";
import { runAI } from "../../utils/ai.js";
import { detectArea, parseArea } from "./ticket-area.utils.js";

import { emailSenderService } from '../../service/email/email-sender.service.js';

import crypto from "crypto";


import { bus } from "../../lib/events.js";

// Extiende Request para tener req.user.id
declare global {
    namespace Express {
        interface Request {
            user?: { id: number };
        }
    }
}

// Crear ticket
export async function createTicket(req: Request, res: Response) {
    try {
        const { empresaId, requesterId, subject, message, priority, assigneeId } = req.body;

        if (!empresaId || !subject) {
            return res.status(400).json({
                ok: false,
                message: "empresaId y subject son obligatorios",
            });
        }

        const publicId = crypto.randomUUID();

        const ticket = await prisma.$transaction(async (tx) => {
            const ticket = await tx.ticket.create({
                data: {
                    publicId,
                    subject,
                    status: TicketStatus.OPEN,
                    priority: priority ?? TicketPriority.NORMAL,
                    channel: "WEB",
                    lastActivityAt: new Date(),

                    // ✅ RELACIONES CORRECTAS
                    empresa: {
                        connect: { id_empresa: empresaId },
                    },

                    ...(requesterId && {
                        requester: {
                            connect: { id_solicitante: requesterId },
                        },
                    }),

                    ...(assigneeId && {
                        assignee: {
                            connect: { id_tecnico: assigneeId },
                        },
                    }),
                },
            });

            await tx.ticketEvent.create({
                data: {
                    ticketId: ticket.id,
                    type: TicketEventType.CREATED,
                    actorType: TicketActorType.SYSTEM,
                },
            });

            if (message?.trim()) {

                await tx.ticketEvent.create({
                    data: {
                        ticketId: ticket.id,
                        type: TicketEventType.MESSAGE_SENT,
                        actorType: TicketActorType.REQUESTER,
                    },
                });
            }

            return ticket;
        });

        bus.emit("ticket.created", {
            id: ticket.id,
            publicId: ticket.publicId,
            subject: ticket.subject,
            empresaId: ticket.empresaId,
            priority: ticket.priority,
            channel: ticket.channel,
        });

        return res.status(201).json({
            ok: true,
            ticketId: ticket.id,
        });
    } catch (error) {
        console.error("[helpdesk] createTicket error:", error);
        return res.status(500).json({
            ok: false,
            message: "Error al crear ticket",
        });
    }
}

// Responder ticket como agente
export async function replyTicketAsAgent(req: Request, res: Response) {
    try {
        const ticketId = Number(req.params.id);
        const { message } = req.body;
        const isInternal = req.body.isInternal === "true";

        const agentId = req.user?.id;

        const files = req.files as Express.Multer.File[] | undefined;

        if (!ticketId) {
            return res.status(400).json({
                ok: false,
                message: "Ticket inválido",
            });
        }

        const ticket = await prisma.ticket.findUnique({
            where: { id: ticketId },
            include: {
                requester: true, // 🆕 Incluir requester para email
            },
        });

        if (!ticket) {
            return res.status(404).json({ ok: false, message: "Ticket no encontrado" });
        }

        const toEmail =
            ticket.requester?.email ||
            ticket.fromEmail ||
            null;

        await prisma.$transaction(async (tx) => {
            const fromEmail = process.env.SMTP_USER ?? null;

            // 1️⃣ Crear mensaje UNA SOLA VEZ
            const createdMessage = await tx.ticketMessage.create({
                data: {
                    ticketId,
                    direction: MessageDirection.OUTBOUND,
                    bodyText: message,
                    isInternal: Boolean(isInternal),
                    fromEmail,
                    toEmail,
                },
            });

            // 2️⃣ Adjuntos
            if (files?.length) {
                for (const file of files) {
                    await tx.ticketAttachment.create({
                        data: {
                            messageId: createdMessage.id,
                            filename: file.originalname,
                            mimeType: file.mimetype,
                            url: file.path,
                            bytes: file.size,
                        },
                    });
                }
            }

            // 3️⃣ Update ticket
            const updateData: any = {
                lastActivityAt: new Date(),
            };

            if (
                ticket.status === TicketStatus.NEW ||
                ticket.status === TicketStatus.PENDING
            ) {
                updateData.status = TicketStatus.OPEN;
            }

            if (!ticket.assigneeId) {
                updateData.assigneeId = agentId;
            }

            if (!ticket.firstResponseAt && !isInternal) {
                updateData.firstResponseAt = new Date();
            }

            await tx.ticket.update({
                where: { id: ticketId },
                data: updateData,
            });

            // 4️⃣ Evento
            await tx.ticketEvent.create({
                data: {
                    ticketId,
                    type: TicketEventType.MESSAGE_SENT,
                    actorType: TicketActorType.AGENT,
                    actorId: agentId ?? null,
                },
            });
        });

        // 🆕 Enviar email al cliente (solo si no es nota interna)
        if (!isInternal && toEmail) {
            await emailSenderService.sendAgentReply(
                ticket,
                message,
                toEmail,
                files?.filter(f => !f.mimetype.includes("internal"))
            );
        }

        bus.emit("ticket.updated", {
            ticketId,
            source: "agent_reply",
        });

        return res.status(200).json({
            ok: true,
            message: "Respuesta enviada correctamente",
        });
    } catch (error) {
        console.error("[helpdesk] replyTicketAsAgent error:", error);
        return res.status(500).json({
            ok: false,
            message: "Error al responder ticket",
        });
    }
}

// Listar tickets con filtros
export async function listTickets(req: Request, res: Response) {
    try {
        const {
            status,
            priority,
            assigneeId,
            empresaId,
            area,
            search,
            page = "1",
            pageSize = "30",
            from,
            to,
        } = req.query;

        const pageNum = Math.max(Number(page), 1);
        const take = Math.min(Number(pageSize) || 30, 100);
        const skip = (pageNum - 1) * take;

        const whereActual: Prisma.TicketWhereInput = {};

        if (status) {
            whereActual.status = status as TicketStatus;
        } else {
            whereActual.status = {
                not: TicketStatus.CLOSED,
            };
        }

        if (priority) whereActual.priority = priority as TicketPriority;
        if (assigneeId) whereActual.assigneeId = Number(assigneeId);
        if (empresaId) whereActual.empresaId = Number(empresaId);

        if (search) {
            whereActual.subject = {
                contains: String(search),
                mode: "insensitive",
            };
        }

        if (from || to) {
            whereActual.lastActivityAt = {
                ...(from && { gte: new Date(from as string) }),
                ...(to && { lt: new Date(to as string) }),
            };
        }

        const parsedArea = parseArea(area);
        const orderBy: Prisma.TicketOrderByWithRelationInput[] = [
            { lastActivityAt: "desc" },
            { updatedAt: "desc" },
            { createdAt: "desc" },
        ];

        let tickets: any[] = [];
        let total = 0;

        if (parsedArea) {
            const areaCandidates = await prisma.ticket.findMany({
                where: whereActual,
                include: {
                    empresa: { select: { nombre: true } },
                    assignee: { select: { id_tecnico: true, nombre: true } },
                    requester: { select: { nombre: true } },
                    messages: {
                        orderBy: { createdAt: "desc" },
                        select: {
                            direction: true,
                            isInternal: true,
                            createdAt: true,
                            bodyText: true,
                            bodyHtml: true,
                            fromEmail: true,
                            toEmail: true,
                            cc: true,
                        },
                    },
                },
                orderBy,
            });

            const filteredByArea = areaCandidates.filter(
                (ticket) => detectArea(ticket) === parsedArea
            );

            total = filteredByArea.length;
            tickets = filteredByArea.slice(skip, skip + take);
        } else {
            const result = await Promise.all([
                prisma.ticket.findMany({
                    where: whereActual,
                    include: {
                        empresa: { select: { nombre: true } },
                        assignee: { select: { id_tecnico: true, nombre: true } },
                        requester: { select: { nombre: true } },
                        messages: {
                            orderBy: { createdAt: "desc" },
                            take: 2,
                            select: {
                                direction: true,
                                isInternal: true,
                                createdAt: true,
                            },
                        },
                    },
                    orderBy,
                    skip,
                    take,
                }),
                prisma.ticket.count({ where: whereActual }),
            ]);

            tickets = result[0];
            total = result[1];
        }

        const statusCounts = await prisma.ticket.groupBy({
            by: ["status"],
            _count: {
                status: true,
            },
        });

        const counts: Record<string, number> = {};

        statusCounts.forEach(s => {
            counts[s.status] = s._count.status;
        });

        const formattedTickets = tickets.map((ticket) => {
            const messages = (ticket.messages ?? []).slice(0, 2).map((message: any) => ({
                direction: message.direction,
                isInternal: message.isInternal,
                createdAt: message.createdAt,
            }));
            const lastMsg = messages[0];
            const isOnlyInitialMessage = messages.length <= 1;

            let lastMessageDirection: MessageDirection | "INTERNAL" | null = null;

            if (!isOnlyInitialMessage) {
                lastMessageDirection = lastMsg?.isInternal
                    ? "INTERNAL"
                    : lastMsg?.direction ?? null;
            }

            return {
                ...ticket,
                messages,
                lastMessageDirection,
            };
        });
        return res.json({
            ok: true,
            page: pageNum,
            pageSize: take,
            total,
            totalPages: Math.ceil(total / take),
            tickets: formattedTickets,
            counts,
        });
    } catch (error) {
        console.error("[helpdesk] listTickets error:", error);
        return res.status(500).json({
            ok: false,
            message: "Error al listar tickets",
        });
    }
}

// Obtener ticket por ID
export async function getTicketById(req: Request, res: Response) {
    try {
        const ticketId = Number(req.params.id);

        if (!ticketId || Number.isNaN(ticketId)) {
            return res.status(400).json({
                ok: false,
                message: "ID de ticket inválido",
            });
        }

        const ticket = await prisma.ticket.findUnique({
            where: { id: ticketId },
            include: {
                empresa: true,
                requester: true,
                assignee: true,
                messages: {
                    orderBy: { createdAt: "asc" },
                    include: { attachments: true },
                },
                events: {
                    orderBy: { createdAt: "asc" },
                },
            },
        });

        if (!ticket) {
            return res.status(404).json({
                ok: false,
                message: "Ticket no encontrado",
            });
        }

        return res.json({ ok: true, ticket });
    } catch (error) {
        console.error("[helpdesk] getTicketById error:", error);
        return res.status(500).json({
            ok: false,
            message: "Error al obtener ticket",
        });
    }
}

// Actualizar ticket (status, priority, assignee)
export async function updateTicket(req: Request, res: Response) {
    try {
        const ticketId = Number(req.params.id);
        const { status, priority, assigneeId } = req.body;
        const agentId = req.user?.id;

        if (!ticketId) {
            return res.status(400).json({
                ok: false,
                message: "Ticket inválido",
            });
        }

        const ticket = await prisma.ticket.findUnique({
            where: { id: ticketId },
        });

        if (!ticket) {
            return res.status(404).json({
                ok: false,
                message: "Ticket no encontrado",
            });
        }

        const updateData: any = {
            lastActivityAt: new Date(),
        };

        const events: any[] = [];

        /* ================== STATUS ================== */
        if (status && status !== ticket.status) {
            updateData.status = status;

            if (status === TicketStatus.RESOLVED) {
                updateData.resolvedAt = new Date();
            }

            if (status === TicketStatus.CLOSED) {
                updateData.closedAt = new Date();
            }

            events.push({
                ticketId,
                type: TicketEventType.STATUS_CHANGED,
                oldValue: ticket.status,
                newValue: status,
                actorType: agentId
                    ? TicketActorType.AGENT
                    : TicketActorType.SYSTEM,
                actorId: agentId ?? null,

            });
        }

        /* ================== PRIORITY ================== */
        if (priority && priority !== ticket.priority) {
            updateData.priority = priority;

            events.push({
                ticketId,
                type: TicketEventType.PRIORITY_CHANGED,
                oldValue: ticket.priority,
                newValue: priority,
                actorType: agentId
                    ? TicketActorType.AGENT
                    : TicketActorType.SYSTEM,
                actorId: agentId ?? null,

            });
        }

        /* ================== ASSIGNEE ================== */
        if (assigneeId !== undefined && assigneeId !== ticket.assigneeId) {
            updateData.assigneeId = assigneeId;

            events.push({
                ticketId,
                type: TicketEventType.ASSIGNED,
                oldValue: ticket.assigneeId?.toString() ?? null,
                newValue: assigneeId?.toString() ?? null,
                actorType: agentId
                    ? TicketActorType.AGENT
                    : TicketActorType.SYSTEM,
                actorId: agentId ?? null,
            });
        }

        if (Object.keys(updateData).length === 1) {
            return res.json({
                ok: true,
                message: "No hubo cambios",
            });
        }

        await prisma.$transaction(async (tx) => {
            await tx.ticket.update({
                where: { id: ticketId },
                data: updateData,
            });

            if (events.length) {
                await tx.ticketEvent.createMany({ data: events });
            }
        });

        bus.emit("ticket.updated", {
            ticketId,
            changes: {
                status,
                priority,
                assigneeId,
            },
        });

        return res.json({
            ok: true,
            message: "Ticket actualizado correctamente",
        });
    } catch (error) {
        console.error("[helpdesk] updateTicket error:", error);
        return res.status(500).json({
            ok: false,
            message: "Error al actualizar ticket",
        });
    }
}

/* ===================== INBOUND EMAIL ===================== */
// Endpoint para recibir emails entrantes desde Graph API (configurado en Azure como webhook)
export async function inboundEmail(req: Request, res: Response) {
    try {
        const { from, subject, text } = req.body;

        if (!from || !text) {
            return res.status(400).json({
                ok: false,
                message: "Email inválido",
            });
        }

        // 1️⃣ Extraer dominio
        const domain = from.split("@")[1]?.toLowerCase();
        if (!domain) {
            return res.status(400).json({
                ok: false,
                message: "No se pudo obtener dominio",
            });
        }

        // 2️⃣ Buscar empresa por dominio
        const empresa = await prisma.empresa.findFirst({
            where: {
                dominios: {
                    has: domain,
                },
            },
        });

        if (!empresa) {
            return res.status(200).json({
                ok: false,
                message: "Empresa no registrada, email ignorado",
            });
        }

        // 3️⃣ Buscar solicitante EXISTENTE (NO crear)
        const requester = await prisma.solicitante.findFirst({
            where: {
                email: from,
                empresaId: empresa.id_empresa,
                isActive: true,
            },
        });

        // 4️⃣ Clasificación IA y Crear ticket
        const mockTicket = { subject: subject || "", messages: [{ bodyText: text }] } as any;
        const area = detectArea(mockTicket) || "SOPORTE";

        const conf = await (prisma as any).areaConfig.findUnique({ where: { nombre: area } });
        let aiSummary = conf?.mensajeBase || "Revisaremos tu caso a la brevedad.";

        try {
            const prompt = `Área: ${area}. Instrucción: "${aiSummary}". Reporte: "${text}". Respuesta breve (máx 30 palabras).`;
            const resAI = await runAI({ userText: prompt, context: { from: "system", transcript: [], email: from } });
            if (resAI) aiSummary = resAI.replace(/^"|"$/g, '');
        } catch (e) {}

        const ticket = await prisma.ticket.create({
            data: {
                publicId: crypto.randomUUID(), subject: subject || "Sin asunto", status: TicketStatus.NEW, priority: TicketPriority.NORMAL, channel: "EMAIL", empresaId: empresa.id_empresa, requesterId: requester?.id_solicitante ?? null, fromEmail: from, aiSummary, lastActivityAt: new Date(),
            },
        });

        // 5️⃣ Mensaje inicial
        await prisma.ticketMessage.create({
            data: {
                ticketId: ticket.id,
                direction: MessageDirection.INBOUND,
                bodyText: text,
                isInternal: false,
                fromEmail: from,
            },
        });

        // 6️⃣ Evento
        await prisma.ticketEvent.create({
            data: {
                ticketId: ticket.id,
                type: TicketEventType.CREATED,
                actorType: TicketActorType.SYSTEM,
            },
        });

        bus.emit("ticket.created", {
            id: ticket.id,
            publicId: ticket.publicId,
            subject: ticket.subject,
            empresaId: ticket.empresaId,
            priority: ticket.priority,
            channel: "EMAIL",
            from,
        });

        return res.json({
            ok: true,
            ticketId: ticket.id,
            requesterAssigned: Boolean(requester),
        });
    } catch (error) {
        console.error("[helpdesk] inboundEmail error:", error);
        return res.status(500).json({
            ok: false,
            message: "Error procesando email entrante",
        });
    }
}

// GET /helpdesk/attachments/:id/download
// Endpoint para descargar adjuntos de tickets (firmas, archivos, etc.)
export async function downloadTicketAttachment(req: Request, res: Response) {
    const attachmentId = Number(req.params.attachmentId);

    const att = await prisma.ticketAttachment.findUnique({
        where: { id: attachmentId },
    });

    if (!att) return res.status(404).json({ ok: false });

    return res.redirect(att.url);
}

// GET /helpdesk/external-image
// Proxy para mostrar imágenes externas (ej. en plantillas de email) sin exponer el URL directo al cliente
export async function proxyExternalImage(req: Request, res: Response) {
    const rawUrl = req.query.url as string;
    if (!rawUrl) return res.sendStatus(400);

    const url = decodeURIComponent(rawUrl);

    try {
        const response = await fetch(url, {
            headers: {
                "User-Agent": "Mozilla/5.0",
                "Accept": "image/*",
            },
        });

        if (!response.ok) return res.sendStatus(404);

        const buffer = Buffer.from(await response.arrayBuffer());

        res.setHeader("Content-Type", response.headers.get("content-type") || "image/png");
        res.setHeader("Cache-Control", "public, max-age=86400");

        return res.send(buffer);
    } catch (err) {
        console.error("❌ proxyExternalImage error", err);
        return res.sendStatus(500);
    }
}

export async function bulkUpdateTickets(req: Request, res: Response) {
    try {
        const { ticketIds, status, assigneeId } = req.body;

        if (!ticketIds?.length) {
            return res.status(400).json({ ok: false });
        }

        await prisma.ticket.updateMany({
            where: { id: { in: ticketIds } },
            data: {
                ...(status && { status }),
                ...(assigneeId !== undefined && { assigneeId }),
                lastActivityAt: new Date(),
            },
        });

        return res.json({ ok: true });
    } catch (err) {
        return res.status(500).json({ ok: false });
    }
}

export async function bulkMergeTickets(req: Request, res: Response) {
    try {
        const { mainTicketId, ticketIds } = req.body;

        if (!mainTicketId || !ticketIds || ticketIds.length < 2) {
            return res.status(400).json({
                ok: false,
                message: "Datos inválidos para fusión",
            });
        }

        const otherTickets = ticketIds.filter((id: number) => id !== mainTicketId);

        await prisma.$transaction(async (tx) => {

            for (const id of otherTickets) {

                // 1️⃣ Obtener ticket actual
                const ticketToMerge = await tx.ticket.findUnique({
                    where: { id },
                });

                if (!ticketToMerge) continue;

                // 2️⃣ Mover mensajes
                await tx.ticketMessage.updateMany({
                    where: { ticketId: id },
                    data: { ticketId: mainTicketId },
                });

                // 3️⃣ Cerrar ticket secundario
                await tx.ticket.update({
                    where: { id },
                    data: {
                        status: TicketStatus.CLOSED,
                        closedAt: new Date(),
                    },
                });

                // 4️⃣ Crear evento correcto
                await tx.ticketEvent.create({
                    data: {
                        ticketId: id,
                        type: TicketEventType.STATUS_CHANGED,
                        oldValue: ticketToMerge.status,
                        newValue: TicketStatus.CLOSED,
                        actorType: TicketActorType.SYSTEM,
                    },
                });
            }
            await tx.ticket.update({
                where: { id: mainTicketId },
                data: {
                    lastActivityAt: new Date(),
                },
            });

        });

        return res.json({ ok: true });

    } catch (error) {
        console.error("bulkMergeTickets error:", error);
        return res.status(500).json({
            ok: false,
            message: "Error al fusionar tickets",
        });
    }
}
