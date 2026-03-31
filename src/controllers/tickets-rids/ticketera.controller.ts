// src/controllers/helpdesk/tickets.controller.ts
import type { Request, Response } from "express";
import { prisma } from "../../lib/prisma.js";
import { TicketStatus, TicketPriority, TicketEventType, TicketActorType, MessageDirection } from "@prisma/client";
import type { Prisma } from "@prisma/client";
import { detectArea, parseArea } from "./ticket-area.utils.js";

import { emailSenderService } from '../../service/email/email-sender.service.js';
import { graphReaderService } from '../../service/email/graph-reader.service.js';
import { buildTicketSla } from "./ticketera-sla.controller.js";

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

// Agrega esta función helper junto a escapeHtml
function toHtmlEntities(str: string): string {
    return str
        .replace(/á/g, "&aacute;")
        .replace(/é/g, "&eacute;")
        .replace(/í/g, "&iacute;")
        .replace(/ó/g, "&oacute;")
        .replace(/ú/g, "&uacute;")
        .replace(/Á/g, "&Aacute;")
        .replace(/É/g, "&Eacute;")
        .replace(/Í/g, "&Iacute;")
        .replace(/Ó/g, "&Oacute;")
        .replace(/Ú/g, "&Uacute;")
        .replace(/ñ/g, "&ntilde;")
        .replace(/Ñ/g, "&Ntilde;")
        .replace(/ü/g, "&uuml;")
        .replace(/ü/g, "&uuml;");
}

// Crear ticket
export async function createTicket(req: Request, res: Response) {
    try {
        const {
            empresaId,
            requesterId,
            subject,
            message,
            priority,
            assigneeId,
            fromEmail: bodyFromEmail,
        } = req.body;

        let empresaIdFinal = empresaId;

        if (!empresaIdFinal && bodyFromEmail?.trim()) {
            const empresaSinClasificar = await prisma.empresa.findFirst({
                where: {
                    nombre: {
                        equals: "SIN CLASIFICAR",
                        mode: "insensitive",
                    },
                },
                select: { id_empresa: true },
            });

            if (!empresaSinClasificar) {
                return res.status(400).json({
                    ok: false,
                    message: "No existe la empresa SIN CLASIFICAR",
                });
            }

            empresaIdFinal = empresaSinClasificar.id_empresa;
        }

        if (!empresaIdFinal || !subject) {
            return res.status(400).json({
                ok: false,
                message: "empresaId y subject son obligatorios",
            });
        }

        if (!requesterId && !bodyFromEmail?.trim()) {
            return res.status(400).json({
                ok: false,
                message: "Debes seleccionar un contacto o ingresar un correo manual",
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
                    fromEmail: bodyFromEmail?.trim() || null,

                    empresa: {
                        connect: { id_empresa: empresaIdFinal },
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
                await tx.ticketMessage.create({
                    data: {
                        ticketId: ticket.id,
                        direction: MessageDirection.OUTBOUND,
                        bodyText: message.trim(),
                        isInternal: false,
                        fromEmail: null,
                        toEmail: bodyFromEmail?.trim() || null,
                    },
                });

                await tx.ticketEvent.create({
                    data: {
                        ticketId: ticket.id,
                        type: TicketEventType.MESSAGE_SENT,
                        actorType: TicketActorType.AGENT,
                    },
                });
            }

            return ticket;
        },
            {
                maxWait: 10000,
                timeout: 15000,
            }
        );

        bus.emit("ticket.created", {
            id: ticket.id,
            publicId: ticket.publicId,
            subject: ticket.subject,
            empresaId: ticket.empresaId,
            priority: ticket.priority,
            channel: ticket.channel,
        });

        // 🆕 Auto-reply si el ticket tiene email de origen
        const fromEmail =
            bodyFromEmail ||           // 1️⃣ email ingresado manualmente por el agente
            ticket.fromEmail ||        // 2️⃣ email de origen si vino de email entrante
            (requesterId
                ? (await prisma.solicitante.findUnique({
                    where: { id_solicitante: requesterId },
                    select: { email: true },
                }))?.email
                : null);

        const normalizedFromEmail = fromEmail?.trim().toLowerCase() || null;

        if (
            normalizedFromEmail &&
            !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedFromEmail)
        ) {
            return res.status(400).json({
                ok: false,
                message: "El correo manual no tiene un formato válido",
            });
        }

        const tecnico = ticket.assigneeId
            ? await prisma.tecnico.findUnique({
                where: { id_tecnico: ticket.assigneeId },
                select: {
                    nombre: true,
                    email: true,
                    cargo: true,    // 🆕
                    area: true,     // 🆕
                    firma: {
                        select: { path: true }
                    }
                }
            })
            : null;

        function escapeHtml(text: string) {
            return text
                .replace(/&/g, "&amp;")
                .replace(/</g, "&lt;")
                .replace(/>/g, "&gt;");
        }

        const nombreTecnico = toHtmlEntities(tecnico?.nombre ?? "Equipo de Soporte T&eacute;cnico");
        const emailTecnico = tecnico?.email ?? "soporte@rids.cl";
        const cargo = toHtmlEntities(tecnico?.cargo ?? "Soporte T&eacute;cnico");
        const areaRaw = tecnico?.area ?? "Soporte Técnico";
        const area = toHtmlEntities(tecnico?.area ?? "Soporte T\u00e9cnico");
        const firmaPath = tecnico?.firma?.path ?? null;

        if (
            normalizedFromEmail &&
            normalizedFromEmail !== process.env.EMAIL_USER?.trim().toLowerCase()
        ) {
            try {

                const firmaHtml = `
<table cellpadding="0" cellspacing="0" style="margin-top:16px;">
  <tr>
    <td style="padding-right:16px; vertical-align:middle;">
      <img src="${firmaPath || "https://res.cloudinary.com/dvqpmttci/image/upload/v1774008233/Logo_Firma_bcm1bs.gif"}" width="120" />
    </td>
    <td style="border-left:2px solid #ddd; padding-left:16px; vertical-align:middle; font-family:Arial, sans-serif; font-size:13px; color:#333; line-height:1.6;">
      <strong style="font-size:14px;">${nombreTecnico}</strong><br/>
      <span style="color:#555;">${cargo}</span><br/>
      <span style="color:#555;">${area}</span><br/>
      <a href="mailto:${emailTecnico}" style="color:#0ea5e9;">${emailTecnico}</a><br/>
      WhatsApp: +56 9 8823 1976<br/>
      <a href="http://www.econnet.cl" style="color:#0ea5e9;">www.econnet.cl</a> ·
      <a href="http://www.rids.cl" style="color:#0ea5e9;">www.rids.cl</a>
    </td>
  </tr>
</table>`;

                const detalleHtml = escapeHtml(message?.trim() || "Sin detalle adicional.")
                    .replace(/\n/g, "<br/>");

                const bodyHtml = `
<!DOCTYPE html>
<html>
<head>
<meta http-equiv="Content-Type" content="text/html; charset=UTF-8" />
  <meta charset="UTF-8"> 
</head>
<body style="font-family: Arial, sans-serif; font-size:14px; color:#333; padding:20px; max-width:600px;">

    <p><strong>Ticket #${ticket.id}</strong></p>

    <p><strong>Asunto:</strong> ${escapeHtml(ticket.subject)}</p>

    <p><strong>Detalle:</strong></p>

    <div style="line-height:1.6;">
        ${detalleHtml}
    </div>

    ${firmaHtml}

    <hr style="border:none; border-top:1px solid #ddd; margin:20px 0;" />

    <p style="font-size:12px; color:#666;">
    <strong>Ticket #${ticket.id}</strong> · ${escapeHtml(ticket.subject)}<br/>
    Soporte T&eacute;cnico · Asesor&iacute;as RIDS Ltda.<br/>
    soporte@rids.cl
</p>
</body>
</html>`;

                await graphReaderService.sendReplyEmail({
                    to: normalizedFromEmail,
                    subject: `Confirmación de ticket #${ticket.id} - ${ticket.subject}`,
                    bodyHtml,
                });
            } catch (err) {
                console.error("⚠️ Error enviando auto-reply:", err);
            }
        }

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
        const to = JSON.parse(req.body.to || "[]");
        const cc = JSON.parse(req.body.cc || "[]");
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
                requester: true,
                assignee: {
                    select: {
                        id_tecnico: true,
                        nombre: true,
                        email: true,
                        cargo: true,    // 🆕
                        area: true,     // 🆕
                        firma: {
                            select: { path: true }
                        }
                    }
                }
            },
        });

        if (!ticket) {
            return res.status(404).json({ ok: false, message: "Ticket no encontrado" });
        }

        const normalizeEmail = (email?: string | null) =>
            email?.trim().toLowerCase() || null;

        const uniqueEmails = (emails: Array<string | null | undefined>) =>
            [...new Set(emails.map(normalizeEmail).filter(Boolean) as string[])];

        const toEmails = uniqueEmails(
            to.length ? to : [ticket.requester?.email || ticket.fromEmail]
        );

        const ccEmails = uniqueEmails(cc || []).filter(
            email => !toEmails.includes(email)
        );

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
                    toEmail: toEmails.join(","), // 👈 también mejoramos esto
                    cc: ccEmails.length ? ccEmails.join(",") : null,
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

            if (!ticket.firstResponseAt && !isInternal && agentId) {
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
        if (!isInternal && toEmails.length > 0) {

            const tecnico = ticket.assignee ?? null;

            // ✅ Fallbacks seguros
            const nombreTecnico = toHtmlEntities(tecnico?.nombre ?? "Equipo de Soporte T&eacute;cnico");
            const emailTecnico = tecnico?.email ?? "soporte@rids.cl";
            const cargo = toHtmlEntities(tecnico?.cargo ?? "Soporte T&eacute;cnico");
            const area = toHtmlEntities(tecnico?.area ?? "Soporte T\u00e9cnico");
            const firmaPath = tecnico?.firma?.path ?? null;
            // ✅ Sanitizar mensaje (ANTI XSS)
            function escapeHtml(text: string) {
                return text
                    .replace(/&/g, "&amp;")
                    .replace(/</g, "&lt;")
                    .replace(/>/g, "&gt;");
            }

            // ✅ Firma unificada (sin duplicación)
            const firmaHtml = `
<table cellpadding="0" cellspacing="0" style="margin-top:16px;">
  <tr>
    <td style="padding-right:16px; vertical-align:middle;">
      <img src="${firmaPath || "https://res.cloudinary.com/dvqpmttci/image/upload/v1774008233/Logo_Firma_bcm1bs.gif"
                }" width="120" />
    </td>
    <td style="border-left:2px solid #ddd; padding-left:16px; vertical-align:middle; font-family:Arial, sans-serif; font-size:13px; color:#333; line-height:1.6;">
      <strong style="font-size:14px;">${nombreTecnico}</strong><br/>
      <span style="color:#555;">${cargo}</span><br/>
      <span style="color:#555;">${area}</span><br/>
      <a href="mailto:${emailTecnico}" style="color:#0ea5e9;">${emailTecnico}</a><br/>
      WhatsApp: +56 9 8823 1976<br/>
      <a href="http://www.econnet.cl" style="color:#0ea5e9;">www.econnet.cl</a> · 
      <a href="http://www.rids.cl" style="color:#0ea5e9;">www.rids.cl</a>
    </td>
  </tr>
</table>`;

            const bodyHtml = `
<!DOCTYPE html>
<html>
<head>
<meta http-equiv="Content-Type" content="text/html; charset=UTF-8" />
  <meta charset="UTF-8"> 
</head>
<body style="font-family: Arial, sans-serif; font-size:14px; color:#333; padding:20px; max-width:600px;">
    <p>${escapeHtml(message).replace(/\n/g, '<br/>')}</p>
    ${firmaHtml}
    <hr style="border:none; border-top:1px solid #ddd; margin:20px 0;" />
    <p style="font-size:12px; color:#666;">
    <strong>Ticket #${ticket.id}</strong> · ${escapeHtml(ticket.subject)}<br/>
    Soporte T&eacute;cnico · Asesor&iacute;as RIDS Ltda.<br/>
    soporte@rids.cl
</p>
</body>
</html>`;

            await graphReaderService.sendReplyEmail({
                to: toEmails,
                cc: ccEmails,
                subject: `Re: Ticket #${ticket.id} - ${ticket.subject}`,
                bodyHtml,
            });
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

        const whereActual: Prisma.TicketWhereInput = {
            AND: [],
        };

        // ✅ Después
        const validStatuses = Object.values(TicketStatus);

        if (status && validStatuses.includes(status as TicketStatus)) {
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
            const searchValue = String(search).trim();
            const searchNumber = Number(searchValue);

            whereActual.OR = [
                {
                    subject: {
                        contains: searchValue,
                        mode: "insensitive",
                    },
                },
                {
                    fromEmail: {
                        contains: searchValue,
                        mode: "insensitive",
                    },
                },
                {
                    empresa: {
                        nombre: {
                            contains: searchValue,
                            mode: "insensitive",
                        },
                    },
                },
                {
                    requester: {
                        nombre: {
                            contains: searchValue,
                            mode: "insensitive",
                        },
                    },
                },
                ...(Number.isInteger(searchNumber)
                    ? [
                        {
                            id: searchNumber,
                        },
                    ]
                    : []),
            ];
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
            const sla = buildTicketSla(ticket);

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
                sla,
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

        const sla = buildTicketSla(ticket);

        return res.json({
            ok: true,
            ticket: {
                ...ticket,
                sla,
            },
        });

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
                if (!ticket.resolvedAt) {
                    updateData.resolvedAt = new Date();
                }
            }

            if (status === TicketStatus.CLOSED) {
                if (!ticket.closedAt) {
                    updateData.closedAt = new Date();
                }
                if (!ticket.resolvedAt) {
                    updateData.resolvedAt = new Date();
                }
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

        if (status && status !== ticket.status) {
            bus.emit("ticket.status_changed", {
                ticketId,
                subject: ticket.subject,
                oldStatus: ticket.status,
                newStatus: status,
                changedBy: agentId ?? null,
            });
        }

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

        // 1️⃣ Extraer dominio limpio
        const domain = from
            ?.split("@")[1]
            ?.replace(/[>"\s]/g, "")
            ?.toLowerCase();

        if (!domain) {
            return res.status(400).json({
                ok: false,
                message: "No se pudo obtener dominio",
            });
        }

        // 2️⃣ Buscar mapping
        const mapping = await prisma.fdSourceMap.findFirst({
            where: { domain }
        });

        let empresa: { nombre: string; id_empresa: number; tieneSucursales: boolean; razonSocial: string | null; dominios: string[] } | null = null;

        if (mapping?.ticketOrgId) {
            const org = await prisma.ticketOrg.findUnique({
                where: { id: mapping.ticketOrgId }
            });

            if (org) {
                empresa = await prisma.empresa.findFirst({
                    where: { nombre: org.name }
                });
            }
        }

        if (!empresa) {
            console.warn("⚠ Empresa no encontrada para dominio:", domain);
        }

        // 3️⃣ Buscar solicitante EXISTENTE (NO crear)
        const requester = await prisma.solicitante.findFirst({
            where: {
                email: from,
                ...(empresa?.id_empresa && {
                    empresaId: empresa.id_empresa
                }),
                isActive: true,
            },
        });

        // 4️⃣ Crear ticket (con o sin requester)
        const ticket = await prisma.ticket.create({
            data: {
                publicId: crypto.randomUUID(),
                subject: subject || "Sin asunto",
                status: TicketStatus.NEW,
                priority: TicketPriority.NORMAL,
                channel: "EMAIL",

                ...(empresa?.id_empresa && {
                    empresaId: empresa.id_empresa
                }),

                requesterId: requester?.id_solicitante ?? null,
                fromEmail: from,

                lastActivityAt: new Date(),
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
                ...(status === TicketStatus.CLOSED && { closedAt: new Date() }),
                ...(status === TicketStatus.CLOSED && { resolvedAt: new Date() }),
                ...(assigneeId !== undefined && { assigneeId }),
                lastActivityAt: new Date(),
            },
        });

        if (status) {
            bus.emit("ticket.bulk_status_changed", {
                ticketIds,
                newStatus: status,
            });
        }

        bus.emit("ticket.updated", {
            source: "bulk_update",
            ticketIds,
            changes: {
                status,
                assigneeId,
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

        bus.emit("ticket.updated", {
            source: "bulk_merge",
            mainTicketId,
            ticketIds,
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

export async function deleteTicket(req: Request, res: Response) {
    try {
        const ticketId = Number(req.params.id);

        if (!ticketId) {
            return res.status(400).json({
                ok: false,
                message: "Ticket inválido",
            });
        }

        await prisma.$transaction(async (tx) => {

            // 1️⃣ Adjuntos
            await tx.ticketAttachment.deleteMany({
                where: {
                    message: {
                        ticketId,
                    },
                },
            });

            // 2️⃣ Mensajes
            await tx.ticketMessage.deleteMany({
                where: { ticketId },
            });

            // 3️⃣ Eventos
            await tx.ticketEvent.deleteMany({
                where: { ticketId },
            });

            // 4️⃣ Ticket
            await tx.ticket.delete({
                where: { id: ticketId },
            });

        });

        return res.json({
            ok: true,
            message: "Ticket eliminado correctamente",
        });

    } catch (error) {
        console.error("[helpdesk] deleteTicket error:", error);
        return res.status(500).json({
            ok: false,
            message: "Error al eliminar ticket",
        });
    }
}