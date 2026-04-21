import { prisma } from "../../lib/prisma.js";
import { TicketStatus, TicketPriority, TicketEventType, TicketActorType, MessageDirection } from "@prisma/client";
import { detectArea, parseArea } from "./ticket-area.utils.js";
import { graphReaderService } from '../../service/email/graph-reader.service.js';
import { buildTicketSla } from "./tickets-sla/ticketera-sla.controller.js";
import { ticketEmailTemplateService } from "../../service/email/reply-templates/ticket-email-template.service.js";
import { sendTicketAssignedEmail } from "./ticket-assignment-mailer.js";
import crypto from "crypto";
import { bus } from "../../lib/events.js";
import { getSlaConfigFromDB } from "../../config/sla.config.js";
// Agrega esta función helper junto a escapeHtml
function toHtmlEntities(str) {
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
function normalizeEmail(email) {
    if (!email)
        return null;
    const cleaned = email.trim().toLowerCase();
    return cleaned || null;
}
function splitEmails(value) {
    if (!value)
        return [];
    return value
        .split(",")
        .map((e) => normalizeEmail(e))
        .filter((e) => Boolean(e));
}
function uniqueEmails(emails) {
    return [...new Set(emails.map(normalizeEmail).filter(Boolean))];
}
function buildReplyRecipients(messages, supportEmail, fallbackTo) {
    const support = normalizeEmail(supportEmail);
    const participants = new Set();
    for (const msg of messages) {
        const from = normalizeEmail(msg.fromEmail);
        const to = splitEmails(msg.toEmail);
        const cc = splitEmails(msg.cc);
        if (from && from !== support)
            participants.add(from);
        for (const email of to) {
            if (email !== support)
                participants.add(email);
        }
        for (const email of cc) {
            if (email !== support)
                participants.add(email);
        }
    }
    const lastInbound = [...messages]
        .reverse()
        .find((m) => m.direction === MessageDirection.INBOUND &&
        normalizeEmail(m.fromEmail) !== support);
    const primaryTo = normalizeEmail(lastInbound?.fromEmail) ||
        normalizeEmail(fallbackTo) ||
        [...participants][0] ||
        null;
    if (!primaryTo) {
        return { to: [], cc: [] };
    }
    participants.delete(primaryTo);
    return {
        to: [primaryTo],
        cc: [...participants],
    };
}
// Crear ticket
export async function createTicket(req, res) {
    try {
        const { empresaId, requesterId, subject, message, priority, assigneeId, fromEmail: bodyFromEmail, } = req.body;
        let empresaIdFinal = empresaId;
        // Si no se envió empresaId pero sí un correo manual, asignamos a "SIN CLASIFICAR" para no bloquear la creación del ticket (el agente luego puede editar el ticket y asignar la empresa correcta).
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
            // Si no existe la empresa "SIN CLASIFICAR", respondemos con error para que el equipo de soporte cree esa empresa primero, ya que es necesaria para este flujo de fallback.
            if (!empresaSinClasificar) {
                return res.status(400).json({
                    ok: false,
                    message: "No existe la empresa SIN CLASIFICAR",
                });
            }
            empresaIdFinal = empresaSinClasificar.id_empresa;
        }
        // Validaciones básicas
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
        // Creamos el ticket dentro de una transacción para asegurar que la creación del ticket, 
        // el evento de creación y el mensaje inicial (si existe) se creen de forma atómica. 
        // Luego emitimos un evento "ticket.created" para que otros sistemas puedan reaccionar a
        //  la creación del ticket (como enviar notificaciones, actualizar dashboards, etc). 
        // Finalmente, si el ticket tiene un correo de origen válido, intentamos enviar 
        // un auto-reply al cliente con un template personalizado.
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
        }, {
            maxWait: 10000,
            timeout: 15000,
        });
        // Emitimos evento de ticket creado para que otros sistemas puedan reaccionar (notificaciones, dashboards, etc)
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
                : null);
        const normalizedFromEmail = fromEmail?.trim().toLowerCase() || null;
        if (normalizedFromEmail &&
            !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedFromEmail)) {
            return res.status(400).json({
                ok: false,
                message: "El correo manual no tiene un formato válido",
            });
        }
        // Si tenemos un correo de origen válido, intentamos enviar un auto-reply al cliente 
        // con un template personalizado. Para esto, renderizamos el template "TICKET_CREATED_WEB"
        //  con la información del ticket y del técnico asignado (si existe). 
        // Si el template está habilitado, enviamos el correo usando el graphReaderService.
        const tecnico = ticket.assigneeId
            ? await prisma.tecnico.findUnique({
                where: { id_tecnico: ticket.assigneeId },
                select: {
                    nombre: true,
                    email: true,
                    cargo: true, // 🆕
                    area: true, // 🆕
                    firma: {
                        select: { path: true }
                    }
                }
            })
            : null;
        // Si el ticket tiene un correo de origen válido, intentamos enviar un auto-reply al cliente
        //  con un template personalizado. Para esto, renderizamos el template 
        // "TICKET_CREATED_WEB" con la información del ticket y del técnico asignado (si existe).
        //  Si el template está habilitado, enviamos el correo usando el graphReaderService.
        if (normalizedFromEmail &&
            normalizedFromEmail !== process.env.EMAIL_USER?.trim().toLowerCase()) {
            try {
                const tecnicoRender = tecnico
                    ? {
                        nombre: tecnico.nombre,
                        email: tecnico.email,
                        cargo: tecnico.cargo,
                        area: tecnico.area,
                        firmaPath: tecnico.firma?.path ?? null,
                    }
                    : null;
                const rendered = await ticketEmailTemplateService.render({
                    key: "TICKET_CREATED_WEB",
                    tecnico: tecnicoRender,
                    vars: {
                        nombre: "Cliente",
                        ticketId: ticket.id,
                        subject: ticket.subject,
                        bodyOriginal: "",
                        messageHtml: ticketEmailTemplateService.textToHtml(message?.trim() || "Sin detalle adicional."),
                        nombreTecnico: tecnico?.nombre || "Equipo de Soporte Técnico",
                        emailTecnico: tecnico?.email || "soporte@rids.cl",
                        cargoTecnico: tecnico?.cargo || "Soporte Técnico",
                        areaTecnico: tecnico?.area || "Soporte Técnico",
                    },
                });
                if (rendered.isEnabled) {
                    await graphReaderService.sendReplyEmail({
                        to: normalizedFromEmail,
                        subject: rendered.subject,
                        bodyHtml: rendered.bodyHtml,
                    });
                }
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
        // Primero actualizamos la base de datos (creación del mensaje, actualización del ticket, creación del evento
        const ticket = await prisma.ticket.findUnique({
            where: { id: ticketId },
            include: {
                requester: true,
                assignee: {
                    select: {
                        id_tecnico: true,
                        nombre: true,
                        email: true,
                        cargo: true,
                        area: true,
                        firma: {
                            select: { path: true }
                        }
                    }
                },
                messages: {
                    orderBy: { createdAt: "asc" },
                    select: {
                        direction: true,
                        fromEmail: true,
                        toEmail: true,
                        cc: true,
                        sourceMessageId: true,
                    },
                },
            },
        });
        if (!ticket) {
            return res.status(404).json({ ok: false, message: "Ticket no encontrado" });
        }
        const supportEmail = (process.env.EMAIL_USER || "").trim().toLowerCase();
        const replyRecipients = buildReplyRecipients(ticket.messages.map((m) => ({
            direction: m.direction,
            fromEmail: m.fromEmail,
            toEmail: m.toEmail,
            cc: m.cc,
        })), supportEmail, ticket.requester?.email ?? ticket.fromEmail ?? null);
        const toEmails = uniqueEmails(to.length ? to : replyRecipients.to);
        const ccEmails = uniqueEmails(cc.length ? cc : replyRecipients.cc).filter(email => !toEmails.includes(email));
        // Actualizamos la base de datos dentro de una transacción para asegurar que la creación 
        // del mensaje, la actualización del ticket y la creación del evento se realicen de 
        // forma atómica. Luego, si el mensaje no es interno, intentamos enviar un correo al cliente con un template personalizado usando el graphReaderService.
        let createdMessageId = null;
        let replyToSourceMessageId = null;
        await prisma.$transaction(async (tx) => {
            const fromEmail = process.env.EMAIL_USER ?? null;
            const lastInboundMessage = [...ticket.messages]
                .reverse()
                .find((m) => m.direction === MessageDirection.INBOUND &&
                m.sourceMessageId);
            replyToSourceMessageId = lastInboundMessage?.sourceMessageId ?? null;
            const createdMessage = await tx.ticketMessage.create({
                data: {
                    ticketId,
                    direction: MessageDirection.OUTBOUND,
                    bodyText: message,
                    isInternal: Boolean(isInternal),
                    fromEmail,
                    toEmail: toEmails.join(","),
                    cc: ccEmails.length ? ccEmails.join(",") : null,
                    sourceInReplyTo: replyToSourceMessageId,
                },
            });
            createdMessageId = createdMessage.id;
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
            const updateData = {
                lastActivityAt: new Date(),
            };
            if (ticket.status === TicketStatus.NEW ||
                ticket.status === TicketStatus.PENDING) {
                updateData.status = TicketStatus.OPEN;
            }
            if (!ticket.firstResponseAt && !isInternal && agentId) {
                updateData.firstResponseAt = new Date();
            }
            await tx.ticket.update({
                where: { id: ticketId },
                data: updateData,
            });
            await tx.ticketEvent.create({
                data: {
                    ticketId,
                    type: TicketEventType.MESSAGE_SENT,
                    actorType: TicketActorType.AGENT,
                    actorId: agentId ?? null,
                },
            });
        });
        //  Enviar email al cliente (solo si no es nota interna)
        if (!isInternal && toEmails.length > 0) {
            const tecnico = ticket.assignee ?? null;
            const tecnicoRender = tecnico
                ? {
                    nombre: tecnico.nombre,
                    email: tecnico.email,
                    cargo: tecnico.cargo,
                    area: tecnico.area,
                    firmaPath: tecnico.firma?.path ?? null,
                }
                : null;
            const rendered = await ticketEmailTemplateService.render({
                key: "AGENT_REPLY",
                tecnico: tecnicoRender,
                vars: {
                    nombre: ticket.requester?.nombre || "Cliente",
                    ticketId: ticket.id,
                    subject: ticket.subject,
                    bodyOriginal: "",
                    messageHtml: ticketEmailTemplateService.textToHtml(message || ""),
                    nombreTecnico: tecnico?.nombre || "Equipo de Soporte Técnico",
                    emailTecnico: tecnico?.email || "soporte@rids.cl",
                    cargoTecnico: tecnico?.cargo || "Soporte Técnico",
                    areaTecnico: tecnico?.area || "Soporte Técnico",
                },
            });
            const emailAttachments = files?.length
                ? await Promise.all(files.map(async (file) => {
                    const response = await fetch(file.path);
                    if (!response.ok) {
                        throw new Error(`No se pudo descargar adjunto: ${file.originalname}`);
                    }
                    const arrayBuffer = await response.arrayBuffer();
                    const fileBuffer = Buffer.from(arrayBuffer);
                    return {
                        name: file.originalname,
                        contentType: file.mimetype || "application/octet-stream",
                        contentBytes: fileBuffer.toString("base64"),
                    };
                }))
                : [];
            if (rendered.isEnabled) {
                const lastInboundMessage = [...ticket.messages]
                    .reverse()
                    .find((m) => m.direction === MessageDirection.INBOUND &&
                    m.sourceMessageId);
                let originalGraphMessageId = null;
                if (lastInboundMessage?.sourceMessageId) {
                    const processed = await prisma.processedInboundEmail.findUnique({
                        where: {
                            sourceMessageId: lastInboundMessage.sourceMessageId,
                        },
                        select: {
                            graphMessageId: true,
                        },
                    });
                    originalGraphMessageId = processed?.graphMessageId ?? null;
                }
                let sentInternetMessageId = null;
                if (originalGraphMessageId) {
                    const sent = await graphReaderService.replyToGraphMessage({
                        originalGraphMessageId,
                        to: toEmails,
                        cc: ccEmails,
                        bodyHtml: rendered.bodyHtml,
                        attachments: emailAttachments,
                    });
                    sentInternetMessageId = sent.internetMessageId;
                }
                else {
                    await graphReaderService.sendReplyEmail({
                        to: toEmails,
                        cc: ccEmails,
                        subject: rendered.subject,
                        bodyHtml: rendered.bodyHtml,
                        attachments: emailAttachments,
                    });
                }
                if (createdMessageId && sentInternetMessageId) {
                    await prisma.ticketMessage.update({
                        where: { id: createdMessageId },
                        data: {
                            sourceMessageId: sentInternetMessageId,
                        },
                    });
                }
            }
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
            deletedAt: null,
            AND: [],
        };
        const validStatuses = Object.values(TicketStatus);
        if (status &&
            status !== "ALL" &&
            validStatuses.includes(status)) {
            whereActual.status = status;
        }
        // Agregamos filtros de prioridad, técnico asignado y empresa si vienen en la query
        if (priority)
            whereActual.priority = priority;
        if (assigneeId)
            whereActual.assigneeId = Number(assigneeId);
        if (empresaId)
            whereActual.empresaId = Number(empresaId);
        // Si viene el filtro de área, lo dejamos para filtrar después de traer los tickets, ya que
        // el área se detecta con lógica personalizada y no es un campo directo en la base de datos
        // Esto nos permite evitar joins complejos o consultas pesadas.
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
        const isClosedFilter = status === TicketStatus.CLOSED;
        const orderBy = isClosedFilter
            ? [
                {
                    closedAt: {
                        sort: "desc",
                        nulls: "last",
                    },
                },
                { createdAt: "desc" },
            ]
            : [
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
                    requester: { select: { nombre: true, email: true } },
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
                        requester: { select: { nombre: true, email: true } },
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
        const slaConfig = await getSlaConfigFromDB();
        // Formateamos la respuesta para incluir solo los primeros 2 mensajes de cada ticket y 
        // construir el campo sla con la información de SLA calculada según la lógica definida en 
        // buildTicketSla. También agregamos el campo lastMessageDirection para indicar la dirección del último mensaje (INBOUND, OUTBOUND o INTERNAL) y facilitar el renderizado en el frontend.
        const formattedTickets = tickets.map((ticket) => {
            const sla = buildTicketSla(ticket, slaConfig);
            const messages = (ticket.messages ?? []).map((message) => ({
                direction: message.direction,
                isInternal: message.isInternal,
                createdAt: message.createdAt,
            }));
            const lastMsg = messages[0];
            let lastMessageDirection = null;
            if (lastMsg) {
                lastMessageDirection = lastMsg.isInternal
                    ? "INTERNAL"
                    : lastMsg.direction ?? null;
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
        const ticket = await prisma.ticket.findFirst({
            where: {
                id: ticketId,
                deletedAt: null,
            },
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
        // Asignar automaticamente a tecnico al abrir el ticket
        const agentId = req.user?.id ?? null;
        const tecnicoActual = agentId
            ? await prisma.tecnico.findUnique({
                where: { id_tecnico: agentId },
                select: { id_tecnico: true, status: true },
            })
            : null;
        let ticketFinal = ticket;
        if (!ticket.assigneeId && tecnicoActual?.status) {
            try {
                ticketFinal = await prisma.ticket.update({
                    where: { id: ticket.id },
                    data: {
                        assigneeId: tecnicoActual.id_tecnico,
                        lastActivityAt: new Date(),
                    },
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
                await prisma.ticketEvent.create({
                    data: {
                        ticketId: ticket.id,
                        type: TicketEventType.ASSIGNED,
                        oldValue: null,
                        newValue: String(tecnicoActual.id_tecnico),
                        actorType: TicketActorType.AGENT,
                        actorId: tecnicoActual.id_tecnico,
                    },
                });
                bus.emit("ticket.updated", {
                    ticketId: ticket.id,
                    changes: {
                        assigneeId: tecnicoActual.id_tecnico,
                    },
                    source: "auto_assign_on_open",
                });
                try {
                    await sendTicketAssignedEmail(ticket.id);
                }
                catch (err) {
                    console.error("⚠️ Error enviando correo de autoasignación:", err);
                }
            }
            catch (error) {
                console.error("[helpdesk] auto assign on open error:", error);
            }
        }
        const slaConfig = await getSlaConfigFromDB();
        const sla = buildTicketSla(ticketFinal, slaConfig);
        const supportEmail = (process.env.EMAIL_USER || "").trim().toLowerCase();
        const replyRecipients = buildReplyRecipients(ticketFinal.messages.map((m) => ({
            direction: m.direction,
            fromEmail: m.fromEmail,
            toEmail: m.toEmail,
            cc: m.cc,
        })), supportEmail, ticketFinal.requester?.email ?? ticketFinal.fromEmail ?? null);
        return res.json({
            ok: true,
            ticket: {
                ...ticketFinal,
                sla,
                replyRecipients,
            },
        });
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
        const updateData = {};
        const events = [];
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
        if (Object.keys(updateData).length === 0) {
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
        const assigneeChanged = assigneeId !== undefined &&
            assigneeId !== ticket.assigneeId &&
            assigneeId !== null;
        if (assigneeChanged) {
            try {
                await sendTicketAssignedEmail(ticketId);
            }
            catch (err) {
                console.error("⚠️ Error enviando correo de asignación:", err);
            }
        }
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
    try {
        const attachmentId = Number(req.params.attachmentId);
        if (!attachmentId || Number.isNaN(attachmentId)) {
            return res.status(400).json({ ok: false, message: "Adjunto inválido" });
        }
        const att = await prisma.ticketAttachment.findUnique({
            where: { id: attachmentId },
        });
        if (!att) {
            return res.status(404).json({ ok: false, message: "Adjunto no encontrado" });
        }
        const response = await fetch(att.url);
        if (!response.ok) {
            return res.status(404).json({
                ok: false,
                message: "No se pudo obtener el archivo",
            });
        }
        const buffer = Buffer.from(await response.arrayBuffer());
        res.setHeader("Content-Type", att.mimeType || "application/octet-stream");
        res.setHeader("Content-Disposition", `attachment; filename*=UTF-8''${encodeURIComponent(att.filename)}`);
        res.setHeader("Content-Length", String(buffer.length));
        return res.send(buffer);
    }
    catch (error) {
        console.error("[helpdesk] downloadTicketAttachment error:", error);
        return res.status(500).json({
            ok: false,
            message: "Error al descargar adjunto",
        });
    }
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
// Endpoint para actualizar múltiples tickets a la vez (status, técnico asignado)
export async function bulkUpdateTickets(req, res) {
    try {
        const { ticketIds, status, assigneeId } = req.body;
        if (!ticketIds?.length) {
            return res.status(400).json({ ok: false });
        }
        const ticketsBefore = await prisma.ticket.findMany({
            where: { id: { in: ticketIds } },
            select: { id: true, assigneeId: true },
        });
        await prisma.ticket.updateMany({
            where: { id: { in: ticketIds } },
            data: {
                ...(status && { status }),
                ...(status === TicketStatus.CLOSED && { closedAt: new Date() }),
                ...(status === TicketStatus.CLOSED && { resolvedAt: new Date() }),
                ...(assigneeId !== undefined && { assigneeId }),
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
        if (assigneeId !== undefined && assigneeId !== null) {
            const changedTicketIds = ticketsBefore
                .filter(ticket => ticket.assigneeId !== assigneeId)
                .map(ticket => ticket.id);
            for (const ticketId of changedTicketIds) {
                try {
                    await sendTicketAssignedEmail(ticketId);
                }
                catch (err) {
                    console.error(`⚠️ Error enviando correo de asignación para ticket #${ticketId}:`, err);
                }
            }
        }
        return res.json({ ok: true });
    }
    catch (err) {
        console.error("[helpdesk] bulkUpdateTickets error:", err);
        return res.status(500).json({ ok: false });
    }
}
// Endpoint para fusionar múltiples tickets en uno solo (moviendo mensajes y cerrando los tickets secundarios)
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
        bus.emit("ticket.updated", {
            source: "bulk_merge",
            mainTicketId,
            ticketIds,
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
// Endpoint para eliminar un ticket (y todos sus mensajes, adjuntos y eventos relacionados) 
export async function deleteTicket(req, res) {
    try {
        const ticketId = Number(req.params.id);
        if (!ticketId) {
            return res.status(400).json({
                ok: false,
                message: "Ticket inválido",
            });
        }
        const ticket = await prisma.ticket.findUnique({
            where: { id: ticketId },
            select: {
                id: true,
                deletedAt: true,
                status: true,
                resolvedAt: true,
                closedAt: true,
            },
        });
        if (!ticket) {
            return res.status(404).json({
                ok: false,
                message: "Ticket no encontrado",
            });
        }
        if (ticket.deletedAt) {
            return res.json({
                ok: true,
                message: "Ticket ya estaba eliminado",
            });
        }
        await prisma.ticket.update({
            where: { id: ticketId },
            data: {
                deletedAt: new Date(),
                status: "CLOSED",
                resolvedAt: ticket.resolvedAt ?? new Date(),
                closedAt: ticket.closedAt ?? new Date(),
                lastActivityAt: new Date(),
            },
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