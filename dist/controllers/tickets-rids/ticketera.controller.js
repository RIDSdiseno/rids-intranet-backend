import { prisma } from "../../lib/prisma.js";
import { TicketStatus, TicketPriority, TicketEventType, TicketActorType, MessageDirection } from "@prisma/client";
import { emailSenderService } from '../../service/email/email-sender.service.js';
import crypto from "crypto";
// Crear ticket
export async function createTicket(req, res) {
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
                await tx.ticketMessage.create({
                    data: {
                        ticketId: ticket.id,
                        direction: MessageDirection.INBOUND,
                        bodyText: message,
                        isInternal: false,
                    },
                });
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
        return res.status(201).json({
            ok: true,
            ticketId: ticket.id,
        });
    }
    catch (error) {
        console.error("[helpdesk] createTicket error:", error);
        return res.status(500).json({
            ok: false,
            message: "Error al crear ticket",
        });
    }
}
// Responder ticket como agente
export async function replyTicketAsAgent(req, res) {
    try {
        const ticketId = Number(req.params.id);
        const { message, isInternal } = req.body;
        const agentId = req.user?.id;
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
        await prisma.$transaction(async (tx) => {
            const fromEmail = process.env.SMTP_USER ?? null;
            const toEmail = ticket.requester?.email ?? null;
            await tx.ticketMessage.create({
                data: {
                    ticketId,
                    direction: MessageDirection.OUTBOUND,
                    bodyText: message,
                    isInternal: Boolean(isInternal),
                    fromEmail,
                    toEmail,
                },
            });
            // Update dinámico
            const updateData = {
                lastActivityAt: new Date(),
            };
            if (ticket.status === TicketStatus.NEW ||
                ticket.status === TicketStatus.PENDING) {
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
            // Evento
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
        if (!isInternal && ticket.requester?.email) {
            try {
                await emailSenderService.sendAgentReply(ticket, message, ticket.requester.email);
                console.log(`📧 Email enviado a ${ticket.requester.email}`);
            }
            catch (emailError) {
                console.error('❌ Error enviando email, pero respuesta guardada:', emailError);
                // No fallar la request si el email falla
            }
        }
        return res.status(200).json({
            ok: true,
            message: "Respuesta enviada correctamente",
        });
    }
    catch (error) {
        console.error("[helpdesk] replyTicketAsAgent error:", error);
        return res.status(500).json({
            ok: false,
            message: "Error al responder ticket",
        });
    }
}
// Listar tickets con filtros
export async function listTickets(req, res) {
    try {
        const { status, assigneeId, empresaId, search } = req.query;
        const where = {};
        const validStatuses = Object.values(TicketStatus);
        if (status) {
            if (Array.isArray(status)) {
                where.status = {
                    in: status.filter((s) => validStatuses.includes(s)),
                };
            }
            else if (validStatuses.includes(status)) {
                where.status = status;
            }
        }
        else {
            // 👇 default: solo activos
            where.status = { not: TicketStatus.CLOSED };
        }
        if (assigneeId) {
            where.assigneeId = Number(assigneeId);
        }
        if (empresaId) {
            where.empresaId = Number(empresaId);
        }
        if (search) {
            where.subject = {
                contains: String(search),
                mode: "insensitive",
            };
        }
        const tickets = await prisma.ticket.findMany({
            where,
            include: {
                empresa: { select: { id_empresa: true, nombre: true } },
                assignee: { select: { id_tecnico: true, nombre: true } },
            },
            orderBy: { lastActivityAt: "desc" },
            take: 50,
        });
        return res.json({ ok: true, tickets });
    }
    catch (error) {
        console.error("[helpdesk] listTickets error:", error);
        return res.status(500).json({
            ok: false,
            message: "Error al listar tickets",
        });
    }
}
// Obtener ticket por ID
export async function getTicketById(req, res) {
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
    }
    catch (error) {
        console.error("[helpdesk] getTicketById error:", error);
        return res.status(500).json({
            ok: false,
            message: "Error al obtener ticket",
        });
    }
}
// Actualizar ticket (status, priority, assignee)
export async function updateTicket(req, res) {
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
        const updateData = {
            lastActivityAt: new Date(),
        };
        const events = [];
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
        return res.json({
            ok: true,
            message: "Ticket actualizado correctamente",
        });
    }
    catch (error) {
        console.error("[helpdesk] updateTicket error:", error);
        return res.status(500).json({
            ok: false,
            message: "Error al actualizar ticket",
        });
    }
}
/* ===================== INBOUND EMAIL ===================== */
export async function inboundEmail(req, res) {
    try {
        const { from, subject, text } = req.body;
        if (!from || !text) {
            return res.status(400).json({
                ok: false,
                message: "Email inválido",
            });
        }
        // 1️⃣ Extraer dominio del correo
        const domain = from.split("@")[1]?.toLowerCase();
        if (!domain) {
            return res.status(400).json({
                ok: false,
                message: "No se pudo obtener dominio del email",
            });
        }
        // 2️⃣ Buscar empresa por dominio
        let empresa = await prisma.empresa.findFirst({
            where: {
                dominios: {
                    has: domain,
                },
            },
        });
        // 3️⃣ Fallback: SIN CLASIFICAR
        if (!empresa) {
            empresa = await prisma.empresa.findFirst({
                where: { nombre: "SIN CLASIFICAR" },
            });
        }
        if (!empresa) {
            return res.status(500).json({
                ok: false,
                message: "Empresa fallback no configurada",
            });
        }
        // 4️⃣ Buscar o crear solicitante
        let requester = await prisma.solicitante.findFirst({
            where: { email: from },
        });
        if (!requester) {
            requester = await prisma.solicitante.create({
                data: {
                    nombre: from.split("@")[0],
                    email: from,
                    empresaId: empresa.id_empresa,
                },
            });
        }
        // 5️⃣ Crear ticket
        const ticket = await prisma.ticket.create({
            data: {
                publicId: crypto.randomUUID(),
                subject: subject || "Sin asunto",
                status: TicketStatus.NEW,
                priority: TicketPriority.NORMAL,
                channel: "EMAIL",
                empresaId: empresa.id_empresa,
                requesterId: requester.id_solicitante,
                lastActivityAt: new Date(),
            },
        });
        // 6️⃣ Mensaje inicial
        await prisma.ticketMessage.create({
            data: {
                ticketId: ticket.id,
                direction: MessageDirection.INBOUND,
                bodyText: text,
                isInternal: false,
            },
        });
        // 7️⃣ Evento
        await prisma.ticketEvent.create({
            data: {
                ticketId: ticket.id,
                type: TicketEventType.CREATED,
                actorType: TicketActorType.REQUESTER,
            },
        });
        return res.json({
            ok: true,
            ticketId: ticket.id,
        });
    }
    catch (error) {
        console.error("[helpdesk] inboundEmail error:", error);
        return res.status(500).json({
            ok: false,
            message: "Error procesando email entrante",
        });
    }
}
//# sourceMappingURL=ticketera.controller.js.map