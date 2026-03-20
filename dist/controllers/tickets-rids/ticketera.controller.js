import { prisma } from "../../lib/prisma.js";
import { TicketStatus, TicketPriority, TicketEventType, TicketActorType, MessageDirection } from "@prisma/client";
import { detectArea, parseArea } from "./ticket-area.utils.js";
import { emailSenderService } from '../../service/email/email-sender.service.js';
import { graphReaderService } from '../../service/email/graph-reader.service.js';
import crypto from "crypto";
import { bus } from "../../lib/events.js";
// Crear ticket
export async function createTicket(req, res) {
    try {
        const { empresaId, requesterId, subject, message, priority, assigneeId, fromEmail: bodyFromEmail } = req.body;
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
        // 🆕 Auto-reply si el ticket tiene email de origen
        const fromEmail = bodyFromEmail || // 1️⃣ email ingresado manualmente por el agente
            ticket.fromEmail || // 2️⃣ email de origen si vino de email entrante
            (requesterId
                ? (await prisma.solicitante.findUnique({
                    where: { id_solicitante: requesterId },
                    select: { email: true },
                }))?.email
                : null); // 3️⃣ email del solicitante registrado
        if (fromEmail && fromEmail !== process.env.EMAIL_USER) {
            try {
                await graphReaderService.sendReplyEmail({
                    to: fromEmail, // ✅ FIX
                    subject: `Re: ${ticket.subject}`, // más limpio
                    bodyHtml: `
                <p>Hemos recibido tu solicitud.</p>
                <p><strong>Ticket #${ticket.id}</strong></p>
                <p>Te responderemos a la brevedad.</p>
            `,
                });
            }
            catch (err) {
                console.error("⚠️ Error enviando auto-reply:", err);
            }
        }
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
        const { message } = req.body;
        const to = JSON.parse(req.body.to || "[]");
        const cc = JSON.parse(req.body.cc || "[]");
        const isInternal = req.body.isInternal === "true";
        const agentId = req.user?.id;
        const files = req.files;
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
                    include: {
                        firma: true
                    }
                }
            },
        });
        if (!ticket) {
            return res.status(404).json({ ok: false, message: "Ticket no encontrado" });
        }
        const toEmails = to.length
            ? to
            : [ticket.requester?.email || ticket.fromEmail].filter(Boolean);
        const ccEmails = cc || [];
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
            const updateData = {
                lastActivityAt: new Date(),
            };
            if (ticket.status === TicketStatus.NEW ||
                ticket.status === TicketStatus.PENDING) {
                updateData.status = TicketStatus.OPEN;
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
        if (!isInternal && toEmails.length > 0) {
            const tecnico = ticket.assignee ?? null;
            // ✅ Fallbacks seguros
            const nombreTecnico = tecnico?.nombre || "Equipo de Soporte Técnico";
            const emailTecnico = tecnico?.email || "soporte@rids.cl";
            const firmaPath = tecnico?.firma?.path || null;
            // ✅ Sanitizar mensaje (ANTI XSS)
            function escapeHtml(text) {
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
      <img src="${firmaPath || "https://res.cloudinary.com/dvqpmttci/image/upload/v1774008233/Logo_Firma_bcm1bs.gif"}" width="120" />
    </td>
    <td style="border-left:2px solid #ddd; padding-left:16px; vertical-align:middle; font-family:Arial, sans-serif; font-size:13px; color:#333; line-height:1.6;">
      <strong>${nombreTecnico}</strong><br/>
      Soporte Técnico · Asesorías RIDS Ltda.<br/>
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
<body style="font-family: Arial, sans-serif; font-size:14px; color:#333; padding:20px; max-width:600px;">
    <p>${escapeHtml(message).replace(/\n/g, '<br/>')}</p>
    ${firmaHtml}
    <hr style="border:none; border-top:1px solid #ddd; margin:20px 0;" />
    <p style="font-size:12px; color:#666;">
        <strong>Ticket #${ticket.id}</strong> · ${ticket.subject}<br/>
        Soporte Técnico · Asesorías RIDS Ltda.<br/>
        soporte@rids.cl
    </p>
</body>
</html>`;
            const lastMessage = await prisma.ticketMessage.findFirst({
                where: { ticketId },
                orderBy: { createdAt: "desc" },
                select: {
                    sourceMessageId: true,
                    sourceReferences: true
                }
            });
            const inReplyTo = lastMessage?.sourceMessageId?.trim();
            const references = lastMessage?.sourceReferences?.trim() ||
                lastMessage?.sourceMessageId?.trim();
            await graphReaderService.sendReplyEmail({
                to: toEmails,
                subject: `Re: Ticket #${ticket.id} - ${ticket.subject}`,
                bodyHtml,
                ...(inReplyTo && { inReplyTo }),
                ...(references && { references }),
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
        const { status, priority, assigneeId, empresaId, area, search, page = "1", pageSize = "30", from, to, } = req.query;
        const pageNum = Math.max(Number(page), 1);
        const take = Math.min(Number(pageSize) || 30, 100);
        const skip = (pageNum - 1) * take;
        const whereActual = {
            AND: [],
        };
        if (status) {
            whereActual.status = status;
        }
        else {
            whereActual.status = {
                not: TicketStatus.CLOSED,
            };
        }
        if (priority)
            whereActual.priority = priority;
        if (assigneeId)
            whereActual.assigneeId = Number(assigneeId);
        if (empresaId)
            whereActual.empresaId = Number(empresaId);
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
                ...(from && { gte: new Date(from) }),
                ...(to && { lt: new Date(to) }),
            };
        }
        const parsedArea = parseArea(area);
        const orderBy = [
            { lastActivityAt: "desc" },
            { updatedAt: "desc" },
            { createdAt: "desc" },
        ];
        let tickets = [];
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
            const filteredByArea = areaCandidates.filter((ticket) => detectArea(ticket) === parsedArea);
            total = filteredByArea.length;
            tickets = filteredByArea.slice(skip, skip + take);
        }
        else {
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
        const counts = {};
        statusCounts.forEach(s => {
            counts[s.status] = s._count.status;
        });
        const formattedTickets = tickets.map((ticket) => {
            const messages = (ticket.messages ?? []).slice(0, 2).map((message) => ({
                direction: message.direction,
                isInternal: message.isInternal,
                createdAt: message.createdAt,
            }));
            const lastMsg = messages[0];
            const isOnlyInitialMessage = messages.length <= 1;
            let lastMessageDirection = null;
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
// Endpoint para recibir emails entrantes desde Graph API (configurado en Azure como webhook)
export async function inboundEmail(req, res) {
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
        let empresa = null;
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
    }
    catch (error) {
        console.error("[helpdesk] inboundEmail error:", error);
        return res.status(500).json({
            ok: false,
            message: "Error procesando email entrante",
        });
    }
}
// GET /helpdesk/attachments/:id/download
// Endpoint para descargar adjuntos de tickets (firmas, archivos, etc.)
export async function downloadTicketAttachment(req, res) {
    const attachmentId = Number(req.params.attachmentId);
    const att = await prisma.ticketAttachment.findUnique({
        where: { id: attachmentId },
    });
    if (!att)
        return res.status(404).json({ ok: false });
    return res.redirect(att.url);
}
// GET /helpdesk/external-image
// Proxy para mostrar imágenes externas (ej. en plantillas de email) sin exponer el URL directo al cliente
export async function proxyExternalImage(req, res) {
    const rawUrl = req.query.url;
    if (!rawUrl)
        return res.sendStatus(400);
    const url = decodeURIComponent(rawUrl);
    try {
        const response = await fetch(url, {
            headers: {
                "User-Agent": "Mozilla/5.0",
                "Accept": "image/*",
            },
        });
        if (!response.ok)
            return res.sendStatus(404);
        const buffer = Buffer.from(await response.arrayBuffer());
        res.setHeader("Content-Type", response.headers.get("content-type") || "image/png");
        res.setHeader("Cache-Control", "public, max-age=86400");
        return res.send(buffer);
    }
    catch (err) {
        console.error("❌ proxyExternalImage error", err);
        return res.sendStatus(500);
    }
}
export async function bulkUpdateTickets(req, res) {
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
    }
    catch (err) {
        return res.status(500).json({ ok: false });
    }
}
export async function bulkMergeTickets(req, res) {
    try {
        const { mainTicketId, ticketIds } = req.body;
        if (!mainTicketId || !ticketIds || ticketIds.length < 2) {
            return res.status(400).json({
                ok: false,
                message: "Datos inválidos para fusión",
            });
        }
        const otherTickets = ticketIds.filter((id) => id !== mainTicketId);
        await prisma.$transaction(async (tx) => {
            for (const id of otherTickets) {
                // 1️⃣ Obtener ticket actual
                const ticketToMerge = await tx.ticket.findUnique({
                    where: { id },
                });
                if (!ticketToMerge)
                    continue;
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
    }
    catch (error) {
        console.error("bulkMergeTickets error:", error);
        return res.status(500).json({
            ok: false,
            message: "Error al fusionar tickets",
        });
    }
}
export async function deleteTicket(req, res) {
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
    }
    catch (error) {
        console.error("[helpdesk] deleteTicket error:", error);
        return res.status(500).json({
            ok: false,
            message: "Error al eliminar ticket",
        });
    }
}
//# sourceMappingURL=ticketera.controller.js.map