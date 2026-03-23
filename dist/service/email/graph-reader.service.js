import { Client } from '@microsoft/microsoft-graph-client';
import { ClientSecretCredential } from '@azure/identity';
import 'isomorphic-fetch';
import { prisma } from '../../lib/prisma.js';
import crypto from 'crypto';
import { TicketStatus, TicketPriority, TicketEventType, TicketActorType, MessageDirection, TicketChannel, } from '@prisma/client';
import { bus } from "../../lib/events.js";
import cloudinary from "../../config/cloudinary.js";
import { Readable } from "stream";
import { emailSenderService } from '../email/email-sender.service.js';
function buildAutoReplyTemplate(params) {
    return `
<!DOCTYPE html>
<html>
<body style="margin:0; padding:0; font-family: Arial, sans-serif; font-size:14px; color:#333;">
<table width="100%" cellpadding="0" cellspacing="0" style="padding:20px;">
  <tr><td style="max-width:600px;">

    <p>Hola <strong>${params.nombre}</strong></p>

    <p>Estimad@</p>

    <p>
      Hemos recibido correctamente su solicitud de soporte. Su ticket ha sido ingresado 
      en nuestro sistema y será asignado a un técnico del equipo de Asesorías RIDS Ltda. 
      para su revisión.
    </p>

    <p>
      Próximamente recibirá una actualización sobre el estado de su requerimiento. 
      Le recordamos que puede responder a este correo si desea agregar más información 
      o antecedentes al caso.
    </p>

    <p><strong>N° de ticket:</strong> #${params.ticketId}<br/>
    <strong>Asunto:</strong> ${params.subject}<br/>
    <strong>Área:</strong> Soporte Técnico / Atención al Cliente</p>

    <p>Agradecemos su contacto y confianza.</p>

    <p>
      Atentamente,<br/>
      <strong>${params.nombreTecnico || "Equipo de Soporte Técnico"}</strong>
      Asesorías RIDS Ltda.<br/>
      soporte@rids.cl | www.rids.cl
    </p>

    <hr style="border:none; border-top:1px solid #ddd; margin:20px 0;" />

    <p style="color:#666; font-size:13px;">
      <strong>${params.nombre}</strong> escribió:<br/>
      <em>${params.bodyOriginal}</em>
    </p>

  </td></tr>
</table>
</body>
</html>`;
}
/* ======================================================
   Servicio Graph Reader
====================================================== */
class GraphReaderService {
    client = null;
    supportEmail;
    constructor() {
        this.supportEmail = (process.env.EMAIL_USER || '').toLowerCase();
        console.log('📧 Graph API Config:');
        console.log(`   Email: ${this.supportEmail}`);
        console.log(`   Tenant: ${process.env.MICROSOFT_TENANT_ID ? '✅' : '❌'}`);
        console.log(`   Client ID: ${process.env.MICROSOFT_CLIENT_ID ? '✅' : '❌'}`);
        console.log(`   Secret: ${process.env.MICROSOFT_CLIENT_SECRET ? '✅' : '❌'}`);
    }
    /* ======================================================
       Cliente Graph
    ====================================================== */
    async getClient() {
        if (this.client)
            return this.client;
        const credential = new ClientSecretCredential(process.env.MICROSOFT_TENANT_ID, process.env.MICROSOFT_CLIENT_ID, process.env.MICROSOFT_CLIENT_SECRET);
        this.client = Client.init({
            authProvider: async (done) => {
                try {
                    const token = await credential.getToken('https://graph.microsoft.com/.default');
                    done(null, token.token);
                }
                catch (err) {
                    done(err, null);
                }
            },
        });
        return this.client;
    }
    /* ======================================================
       Lectura de correos
    ====================================================== */
    async readUnreadEmails() {
        try {
            console.log('🔐 Conectando a Microsoft Graph API...');
            const client = await this.getClient();
            const now = new Date();
            const minutes = 10;
            const since = new Date(Date.now() - minutes * 60 * 1000);
            const response = await client
                .api(`/users/${this.supportEmail}/messages`)
                .filter(`receivedDateTime ge ${since.toISOString()}`)
                .select('id,subject,from,toRecipients,ccRecipients,body,receivedDateTime,internetMessageId,conversationId,hasAttachments,internetMessageHeaders')
                .top(100)
                .orderby('receivedDateTime desc')
                .get();
            const messages = response.value ?? [];
            if (messages.length === 0) {
                console.log('📭 No hay emails sin leer');
                return;
            }
            console.log(`📧 Encontrados ${messages.length} emails recientes`);
            for (const message of messages) {
                try {
                    await this.processMessage(message);
                }
                catch (err) {
                    console.error('❌ Error procesando mensaje:', err);
                }
            }
            console.log('✅ Procesamiento de correos finalizado');
        }
        catch (err) {
            console.error('❌ Error en Graph API:', err.message);
            throw err;
        }
    }
    // ... otros métodos (fetchAttachmentsMeta, stripHtml, createOrUpdateTicket, etc.) ...
    /* ======================================================
       Guardar adjuntos
    ====================================================== */
    async saveAttachments(ticketId, messageId, data) {
        if (!data.attachmentsMeta?.length)
            return;
        for (const att of data.attachmentsMeta) {
            const buffer = await this.downloadAttachment(data.graphMessageId, att.graphAttachmentId);
            if (!buffer)
                continue;
            const safeName = att.filename.replace(/[^\w.\-]/g, "_");
            // 🔥 Subir a Cloudinary usando stream
            const uploadResult = await new Promise((resolve, reject) => {
                const stream = cloudinary.uploader.upload_stream({
                    folder: `rids/helpdesk/tickets/${ticketId}`,
                    resource_type: "auto",
                    public_id: `email_${ticketId}_${Date.now()}`,
                }, (error, result) => {
                    if (error)
                        reject(error);
                    else
                        resolve(result);
                });
                Readable.from(buffer).pipe(stream);
            });
            await prisma.ticketAttachment.create({
                data: {
                    messageId,
                    filename: safeName,
                    mimeType: att.mimeType,
                    bytes: att.bytes,
                    url: uploadResult.secure_url,
                    isInline: att.isInline,
                    contentId: att.contentId,
                },
            });
        }
    }
    /* ======================================================
       Procesar mensaje individual
    ====================================================== */
    async processMessage(message) {
        const graphMessageId = message.id;
        // 🔥 ID REAL DEL EMAIL (CLAVE)
        const internetMessageId = message.internetMessageId;
        /* =============================
           1️⃣ DEDUPE (PRIMERO DE TODO)
        ============================= */
        const existingMsg = await prisma.ticketMessage.findUnique({
            where: { sourceMessageId: internetMessageId },
            select: { id: true },
        });
        if (existingMsg) {
            console.log(`⏭️ Ignorado: email ya procesado (${graphMessageId})`);
            return;
        }
        /* =============================
           2️⃣ DATOS BÁSICOS
        ============================= */
        const fromEmailRaw = message.from?.emailAddress?.address;
        if (!fromEmailRaw) {
            console.warn("⚠️ Email sin remitente, se ignora");
            return;
        }
        const fromEmail = fromEmailRaw.toLowerCase();
        const fromName = message.from?.emailAddress?.name ||
            fromEmail.split('@')[0] ||
            'Desconocido';
        const subject = message.subject || 'Sin asunto';
        /* =============================
   🔥 HEADERS (THREADING REAL)
============================= */
        const headers = message.internetMessageHeaders;
        const references = headers?.find((h) => h.name === "References")?.value;
        const inReplyTo = headers?.find((h) => h.name === "In-Reply-To")?.value;
        /* =============================
           3️⃣ VALIDAR DESTINATARIO
        ============================= */
        const toAddresses = message.toRecipients?.map((r) => r.emailAddress.address.toLowerCase()) || [];
        const ccAddresses = message.ccRecipients?.map((r) => r.emailAddress.address.toLowerCase()) || [];
        const isToSupport = toAddresses.includes(this.supportEmail) ||
            ccAddresses.includes(this.supportEmail);
        if (!isToSupport) {
            console.log('⏭️ Ignorado: no dirigido a soporte');
            return;
        }
        /* =============================
           4️⃣ FILTRO SPAM / SISTEMA (SENDER)
        ============================= */
        const blockedSenders = [
            'postmaster@',
            'mailer-daemon',
            'no-reply',
            'noreply',
            'bounce',
        ];
        if (blockedSenders.some(b => fromEmail.includes(b))) {
            console.log(`⏭️ Ignorado: correo automático (${fromEmail})`);
            return;
        }
        /* =============================
           5️⃣ CUERPO
        ============================= */
        const bodyHtml = message.body?.content || '';
        const bodyText = message.body?.contentType === 'text'
            ? message.body.content
            : this.stripHtml(bodyHtml);
        /* =============================
           6️⃣ FILTRO AUTOMÁTICOS (CONTENIDO)
        ============================= */
        const autoPatterns = [
            'a new ticket has been assigned',
            'please follow the link below',
            'freshdesk',
            'helpdesk',
        ];
        const bodyLower = bodyText.toLowerCase();
        const subjectLower = subject.toLowerCase();
        if (autoPatterns.some(p => bodyLower.includes(p)) ||
            subjectLower.includes('assigned to your group') ||
            subjectLower.includes('ticket has been assigned')) {
            console.log(`⏭️ Ignorado: notificación automática (${fromEmail})`);
            return;
        }
        /* =============================
           7️⃣ DETECTAR INTERNOS (MULTI DOMINIO)
        ============================= */
        const internalDomains = ['rids.cl'];
        const isInternal = internalDomains.some(d => fromEmail.endsWith(`@${d}`));
        /* =============================
           8️⃣ CONSTRUIR DATA
        ============================= */
        const emailData = {
            fromEmail,
            fromName,
            subject,
            bodyText,
            bodyHtml,
            messageId: internetMessageId, // 🔥 ESTE ES EL CAMBIO MÁS IMPORTANTE
            graphMessageId,
            conversationId: message.conversationId || '',
            ...(references && { references }),
            ...(inReplyTo && { inReplyTo }),
            cc: ccAddresses,
            attachmentsMeta: [],
        };
        /* =============================
           9️⃣ BUSCAR TICKET
        ============================= */
        const existingTicket = await this.findExistingTicket(emailData);
        if (isInternal && !existingTicket) {
            console.log(`⏭️ Ignorado interno sin ticket (${fromEmail})`);
            return;
        }
        /* =============================
           🔟 ADJUNTOS
        ============================= */
        if (message.hasAttachments) {
            try {
                emailData.attachmentsMeta =
                    await this.fetchAttachmentsMeta(graphMessageId);
            }
            catch (err) {
                console.error('⚠️ Error obteniendo adjuntos:', err);
                emailData.attachmentsMeta = [];
            }
        }
        /* =============================
           1️⃣1️⃣ PROCESAR
        ============================= */
        console.log(`📨 Procesando: ${fromEmail} - ${subject}`);
        await this.createOrUpdateTicket(emailData, existingTicket);
    }
    /* ======================================================
       Obtener metadatos de adjuntos
    ====================================================== */
    async fetchAttachmentsMeta(graphMessageId) {
        const client = await this.getClient();
        const res = await client
            .api(`/users/${this.supportEmail}/messages/${graphMessageId}/attachments`)
            .top(50)
            .get();
        const items = res.value ?? [];
        return items.map((a) => {
            let contentId = null;
            // 🔥 SOLO fileAttachment tiene contentId
            if (a['@odata.type'] === '#microsoft.graph.fileAttachment') {
                contentId = a.contentId
                    ? a.contentId
                        .replace(/^cid:/i, '')
                        .replace(/^</, '')
                        .replace(/>$/, '')
                    : null;
            }
            return {
                graphAttachmentId: a.id,
                filename: a.name,
                mimeType: a.contentType,
                bytes: a.size ?? 0,
                isInline: a.isInline ?? false,
                contentId, // ✅ AHORA SÍ
            };
        });
    }
    /* ======================================================
       Limpieza HTML
    ====================================================== */
    stripHtml(html) {
        return html
            .replace(/<[^>]*>/g, '')
            .replace(/&nbsp;/g, ' ')
            .replace(/&amp;/g, '&')
            .replace(/&lt;/g, '<')
            .replace(/&gt;/g, '>')
            .replace(/&quot;/g, '"')
            .trim();
    }
    /* ======================================================
       Crear o actualizar ticket
    ====================================================== */
    async createOrUpdateTicket(data, existingTicket) {
        /* =============================
           1️⃣ SI YA EXISTE → REPLY
        ============================= */
        if (existingTicket) {
            await this.addMessageToTicket(existingTicket.id, data);
            console.log(`✅ Mensaje agregado al ticket #${existingTicket.id}`);
            return;
        }
        /* =============================
           2️⃣ VALIDAR EMPRESA
        ============================= */
        const domain = data.fromEmail
            .split("@")[1]
            ?.replace(/[>"\s]/g, "")
            ?.toLowerCase();
        if (!domain)
            return;
        let empresa = null;
        const mapping = await prisma.fdSourceMap.findFirst({
            where: { domain }
        });
        if (mapping?.ticketOrgId) {
            const org = await prisma.ticketOrg.findUnique({
                where: { id: mapping.ticketOrgId }
            });
            if (org) {
                empresa = await prisma.empresa.findFirst({
                    where: {
                        nombre: {
                            contains: org.name,
                            mode: "insensitive"
                        }
                    }
                });
            }
        }
        if (!empresa) {
            console.warn(`⚠️ Dominio ${domain} no reconocido`);
            empresa = await prisma.empresa.findFirst({
                where: { nombre: 'SIN CLASIFICAR' },
            });
            if (!empresa) {
                throw new Error('Empresa SIN CLASIFICAR no existe');
            }
            console.log(`⚠️ Dominio ${domain} → SIN CLASIFICAR`);
        }
        if (!empresa) {
            throw new Error('Empresa SIN CLASIFICAR no existe');
        }
        /* =============================
           3️⃣ SOLICITANTE
        ============================= */
        let requester = await prisma.solicitante.findFirst({
            where: {
                email: data.fromEmail,
            },
        });
        // 🔥 SI EXISTE PERO ESTÁ EN OTRA EMPRESA → CORREGIR
        if (requester && requester.empresaId !== empresa.id_empresa) {
            console.log("🔁 Corrigiendo empresa del solicitante");
            requester = await prisma.solicitante.update({
                where: { id_solicitante: requester.id_solicitante },
                data: { empresaId: empresa.id_empresa },
            });
        }
        if (!requester) {
            console.warn(`⚠️ Solicitante no registrado: ${data.fromEmail}`);
        }
        /* =============================
   3️⃣.5 DETECTAR TÉCNICO
============================= */
        const tecnicoDetectado = await prisma.tecnico.findFirst({
            where: {
                empresaId: empresa.id_empresa,
                status: true
            },
            orderBy: { id_tecnico: "asc" }
        });
        const tecnicoFinal = tecnicoDetectado ?? await prisma.tecnico.findFirst({
            where: { status: true },
            orderBy: { id_tecnico: "asc" }
        });
        /* =============================
   4️⃣ + 5️⃣ CREAR TICKET + MENSAJE (ATÓMICO)
============================= */
        let ticket;
        let msg;
        try {
            const result = await prisma.$transaction(async (tx) => {
                const t = await tx.ticket.create({
                    data: {
                        publicId: crypto.randomUUID(),
                        subject: data.subject,
                        status: TicketStatus.OPEN,
                        priority: this.detectPriority(data.subject, data.bodyText),
                        channel: TicketChannel.EMAIL,
                        empresaId: empresa.id_empresa,
                        requesterId: requester?.id_solicitante ?? null,
                        assigneeId: null,
                        fromEmail: data.fromEmail,
                        inboxEmail: this.supportEmail,
                        lastActivityAt: new Date(),
                    },
                });
                const m = await tx.ticketMessage.create({
                    data: {
                        ticketId: t.id,
                        direction: MessageDirection.INBOUND,
                        bodyText: data.bodyText,
                        bodyHtml: data.bodyHtml,
                        isInternal: false,
                        fromEmail: data.fromEmail,
                        cc: data.cc.length ? data.cc.join(",") : null,
                        toEmail: this.supportEmail,
                        sourceMessageId: data.messageId, // 🔥 unique → protege contra duplicados
                        sourceInReplyTo: data.inReplyTo || null,
                        sourceReferences: data.references || null,
                    },
                });
                return { ticket: t, msg: m };
            });
            ticket = result.ticket;
            msg = result.msg;
        }
        catch (err) {
            // 🔥 Si sourceMessageId ya existe → ticket duplicado, ignorar todo
            if (err.code === 'P2002') {
                console.log(`⏭️ Ticket ya existe para messageId ${data.messageId}, ignorando`);
                return;
            }
            throw err;
        }
        /* =============================
           6️⃣ ADJUNTOS
        ============================= */
        await this.saveAttachments(ticket.id, msg.id, data);
        /* =============================
           7️⃣ EVENTOS
        ============================= */
        bus.emit("ticket.created", {
            id: ticket.id,
            publicId: ticket.publicId,
            subject: ticket.subject,
            empresaId: ticket.empresaId,
            priority: ticket.priority,
            channel: TicketChannel.EMAIL,
            from: data.fromEmail,
        });
        /* =============================
   8️⃣ AUTO-REPLY (ROBUSTO)
============================= */
        try {
            console.log("📤 Preparando auto-reply...");
            // ✅ 1. Validar destinatario
            if (!data.fromEmail || !data.fromEmail.includes("@")) {
                console.warn("⚠️ Email inválido, no se envía:", data.fromEmail);
                return;
            }
            if (data.fromEmail === this.supportEmail) {
                console.warn("⚠️ Email es soporte, no se envía auto-reply");
                return;
            }
            // 🔥 Obtener técnico + firma
            let tecnico = null;
            if (ticket.assigneeId) {
                tecnico = await prisma.tecnico.findUnique({
                    where: { id_tecnico: ticket.assigneeId },
                    select: {
                        nombre: true,
                        email: true,
                        firma: {
                            select: { path: true }
                        }
                    }
                });
            }
            const html = buildAutoReplyTemplate({
                nombre: data.fromName || "Cliente",
                ticketId: ticket.id,
                subject: ticket.subject,
                bodyOriginal: data.bodyHtml || data.bodyText,
                ...(tecnico?.nombre && { nombreTecnico: tecnico.nombre }) // 🔥 CLAVE
            });
            console.log("📨 TO:", data.fromEmail);
            console.log("📨 FROM:", this.supportEmail);
            // 🔥 Construir firma HTML
            const firmaHtml = tecnico?.firma?.path
                ? `
<table cellpadding="0" cellspacing="0" style="margin-top:16px;">
  <tr>
    <td style="padding-right:16px; vertical-align:middle;">
      <img src="${tecnico.firma.path}" width="120" />
    </td>
    <td style="border-left:2px solid #ddd; padding-left:16px; vertical-align:middle; font-family:Arial, sans-serif; font-size:13px; color:#333; line-height:1.6;">
      <strong>${tecnico.nombre}</strong><br/>
      Soporte Técnico · Asesorías RIDS Ltda.<br/>
      <a href="mailto:${tecnico.email}" style="color:#0ea5e9;">${tecnico.email}</a><br/>
      WhatsApp: +56 9 8823 1976<br/>
      <a href="http://www.econnet.cl" style="color:#0ea5e9;">www.econnet.cl</a> · 
      <a href="http://www.rids.cl" style="color:#0ea5e9;">www.rids.cl</a>
    </td>
  </tr>
</table>`
                : `
<table cellpadding="0" cellspacing="0" style="margin-top:16px;">
  <tr>
    <td style="padding-right:16px; vertical-align:middle;">
      <img src="https://res.cloudinary.com/dvqpmttci/image/upload/v1774008233/Logo_Firma_bcm1bs.gif" width="120" />
    </td>
    <td style="border-left:2px solid #ddd; padding-left:16px; vertical-align:middle; font-family:Arial, sans-serif; font-size:13px; color:#333; line-height:1.6;">
      <strong>Equipo de Soporte Técnico</strong><br/>
      Asesorías RIDS Ltda.<br/>
      <a href="mailto:soporte@rids.cl" style="color:#0ea5e9;">soporte@rids.cl</a><br/>
      WhatsApp: +56 9 8823 1976<br/>
      <a href="http://www.econnet.cl" style="color:#0ea5e9;">www.econnet.cl</a> · 
      <a href="http://www.rids.cl" style="color:#0ea5e9;">www.rids.cl</a>
    </td>
  </tr>
</table>`;
            const htmlFinal = `${html}${firmaHtml}`;
            await this.sendReplyEmail({
                to: data.fromEmail,
                subject: `Re: ${ticket.subject}`,
                bodyHtml: htmlFinal,
            });
            // ✅ Registrar mensaje interno
            await prisma.ticketMessage.create({
                data: {
                    ticketId: ticket.id,
                    direction: MessageDirection.OUTBOUND,
                    bodyText: 'Correo automático de confirmación enviado',
                    bodyHtml: htmlFinal, // 🔥 AQUÍ ESTÁ LA FIRMA
                    isInternal: false, // 🔥 IMPORTANTE (si no, no aparece como email)
                    fromEmail: this.supportEmail,
                    toEmail: data.fromEmail,
                },
            });
            console.log(`✅ Auto-reply enviado correctamente a ${data.fromEmail}`);
        }
        catch (err) {
            console.error("❌ ERROR REAL GRAPH:");
            console.error(JSON.stringify(err?.body || err, null, 2));
        }
        console.log(`✅ Ticket #${ticket.id} creado (${empresa.nombre})`);
    }
    /* ======================================================
       Buscar ticket existente
    ====================================================== */
    async findExistingTicket(data) {
        /* =============================
           1️⃣ POR HEADERS (REAL THREADING)
        ============================= */
        const orConditions = [];
        if (data.inReplyTo) {
            orConditions.push({
                sourceMessageId: data.inReplyTo.trim()
            });
        }
        if (data.references) {
            const refs = data.references.split(" ");
            for (const ref of refs) {
                orConditions.push({
                    sourceMessageId: ref.trim()
                });
            }
        }
        if (orConditions.length > 0) {
            const ticket = await prisma.ticket.findFirst({
                where: {
                    messages: {
                        some: {
                            OR: orConditions
                        }
                    },
                }
            });
            if (ticket)
                return ticket;
        }
        /* =============================
           2️⃣ FALLBACK POR MESSAGE ID
        ============================= */
        if (data.messageId) {
            const ticket = await prisma.ticket.findFirst({
                where: {
                    messages: {
                        some: {
                            sourceMessageId: data.messageId
                        }
                    },
                }
            });
            if (ticket)
                return ticket;
        }
        /* =============================
           3️⃣ FALLBACK POR SUBJECT (#ID)
        ============================= */
        const match = data.subject.match(/Ticket\s+#(\d+)/i);
        if (match?.[1]) {
            const ticketId = Number(match[1]);
            // 🔥 VALIDACIÓN CRÍTICA
            if (!Number.isInteger(ticketId) ||
                ticketId <= 0 ||
                ticketId > 2147483647) {
                console.warn(`⚠️ ID inválido detectado en subject: ${match[1]}`);
                return null;
            }
            return prisma.ticket.findFirst({
                where: {
                    id: ticketId,
                }
            });
        }
        return null;
    }
    /* ======================================================
       Agregar mensaje a ticket
    ====================================================== */
    async addMessageToTicket(ticketId, data) {
        // 1) DB rápido (sin adjuntos)
        const msg = await prisma.$transaction(async (tx) => {
            // ✅ DEDUPE primero para que no duplique nada
            const exists = await tx.ticketMessage.findUnique({
                where: { sourceMessageId: data.messageId },
                select: { id: true },
            });
            if (exists)
                return null;
            const created = await tx.ticketMessage.create({
                data: {
                    ticketId,
                    direction: MessageDirection.INBOUND,
                    bodyText: data.bodyText,
                    bodyHtml: data.bodyHtml,
                    isInternal: false,
                    fromEmail: data.fromEmail,
                    toEmail: this.supportEmail,
                    cc: data.cc.length ? data.cc.join(",") : null,
                    sourceMessageId: data.messageId,
                    sourceInReplyTo: data.inReplyTo || null,
                    sourceReferences: data.references || null,
                },
            });
            await tx.ticket.update({
                where: { id: ticketId },
                data: { lastActivityAt: new Date() },
            });
            const ticketActual = await tx.ticket.findUnique({
                where: { id: ticketId },
                select: { status: true }
            });
            if (ticketActual?.status === TicketStatus.CLOSED) {
                console.log(`🔄 Reabriendo ticket #${ticketId}`);
                await tx.ticket.update({
                    where: { id: ticketId },
                    data: {
                        status: TicketStatus.OPEN,
                        resolvedAt: null,
                        closedAt: null,
                    }
                });
                await tx.ticketEvent.create({
                    data: {
                        ticketId,
                        type: TicketEventType.STATUS_CHANGED,
                        actorType: TicketActorType.SYSTEM,
                    }
                });
            }
            await tx.ticketEvent.create({
                data: {
                    ticketId,
                    type: TicketEventType.MESSAGE_SENT,
                    actorType: TicketActorType.REQUESTER,
                },
            });
            return created;
        });
        // si ya estaba procesado, no seguimos
        if (!msg)
            return;
        // 2) Adjuntos FUERA de la transacción (lento)
        try {
            await this.saveAttachments(ticketId, msg.id, data);
        }
        catch (e) {
            console.error("⚠️ Error guardando adjuntos:", e);
            // opcional: registrar evento/flag para reintentar luego
        }
        // 3) Emitir eventos
        bus.emit("ticket.message", {
            ticketId,
            direction: "INBOUND",
            from: data.fromEmail,
            subject: data.subject,
        });
        bus.emit("ticket.updated", {
            ticketId,
            lastActivityAt: new Date(),
        });
    }
    /* ======================================================
       Prioridad
    ====================================================== */
    detectPriority(subject, body) {
        const text = `${subject} ${body}`.toLowerCase();
        if (['urgente', 'emergencia', 'crítico', 'bloqueante'].some(k => text.includes(k))) {
            return TicketPriority.URGENT;
        }
        if (['importante', 'asap', 'prioridad', 'cuanto antes'].some(k => text.includes(k))) {
            return TicketPriority.HIGH;
        }
        return TicketPriority.NORMAL;
    }
    // ... otros métodos como translateStatus, escapeHtml, etc. ...
    /* ======================================================
       Descargar adjunto desde Graph API
    ====================================================== */
    async downloadAttachment(graphMessageId, attachmentId) {
        const client = await this.getClient();
        const res = await client
            .api(`/users/${this.supportEmail}/messages/${graphMessageId}/attachments/${attachmentId}`)
            .get();
        // Solo fileAttachment tiene contenido
        if (res['@odata.type'] === '#microsoft.graph.fileAttachment' &&
            res.contentBytes) {
            return Buffer.from(res.contentBytes, 'base64');
        }
        return null;
    }
    // Método para enviar email de respuesta (usado en respuestas desde el frontend, etc.)
    async sendReplyEmail(params) {
        const client = await this.getClient();
        const toRecipients = (Array.isArray(params.to) ? params.to : [params.to])
            .filter(Boolean);
        const ccRecipients = (params.cc ?? []).filter(Boolean);
        console.log("📤 Enviando email vía Graph a:", toRecipients);
        await client
            .api(`/users/${this.supportEmail}/sendMail`)
            .post({
            message: {
                subject: params.subject,
                body: {
                    contentType: "HTML",
                    content: params.bodyHtml,
                },
                toRecipients: toRecipients.map(address => ({
                    emailAddress: { address },
                })),
                ccRecipients: ccRecipients.map(address => ({
                    emailAddress: { address },
                })),
            },
            saveToSentItems: true,
        });
        console.log("✅ Graph sendMail ejecutado");
    }
    toSantiagoDateTime(dateTime, timeZone) {
        const SANTIAGO_TZ = "America/Santiago";
        const SANTIAGO_WINDOWS = "Pacific SA Standard Time";
        if (!dateTime)
            return "";
        // Graph devolvió la hora ya en Santiago → usar directo
        if (timeZone === SANTIAGO_TZ || timeZone === SANTIAGO_WINDOWS) {
            return dateTime.slice(0, 16);
        }
        // Cualquier otro timezone (incluyendo UTC) → convertir a Santiago
        const utcString = dateTime.endsWith("Z") ? dateTime : `${dateTime}Z`;
        const date = new Date(utcString);
        if (isNaN(date.getTime()))
            return dateTime.slice(0, 16);
        const parts = new Intl.DateTimeFormat("en-CA", {
            timeZone: SANTIAGO_TZ,
            year: "numeric",
            month: "2-digit",
            day: "2-digit",
            hour: "2-digit",
            minute: "2-digit",
            hour12: false,
        }).formatToParts(date);
        const get = (type) => parts.find(p => p.type === type)?.value ?? "00";
        return `${get("year")}-${get("month")}-${get("day")}T${get("hour")}:${get("minute")}`;
    }
    async readCalendarEvents(startDateTime, endDateTime) {
        try {
            const client = await this.getClient();
            const allEvents = [];
            let response = await client
                .api(`/users/${this.supportEmail}/calendarView`)
                .query({ startDateTime, endDateTime })
                .orderby("start/dateTime asc")
                .select("id,subject,start,end,categories,body,attendees")
                .header("Prefer", 'outlook.timezone="America/Santiago"')
                .get();
            allEvents.push(...(response.value ?? []));
            while (response['@odata.nextLink']) {
                response = await client
                    .api(response['@odata.nextLink'])
                    .get();
                allEvents.push(...(response.value ?? []));
            }
            return allEvents.map((event) => ({
                id: event.id || "",
                subject: event.subject || "",
                start: this.toSantiagoDateTime(event.start?.dateTime || "", event.start?.timeZone || "UTC"),
                end: this.toSantiagoDateTime(event.end?.dateTime || "", event.end?.timeZone || "UTC"),
                categories: event.categories || [],
                body: event.body?.content || "",
                attendees: event.attendees || [],
            }));
        }
        catch (err) {
            console.error("[GRAPH CALENDAR READ] Error leyendo eventos:", err);
            return [];
        }
    }
    async createCalendarEvent(params) {
        const client = await this.getClient();
        const timeZone = "America/Santiago";
        const payload = {
            subject: params.subject,
            body: {
                contentType: "HTML",
                content: params.bodyHtml || "",
            },
            start: {
                dateTime: params.startDateTime,
                timeZone,
            },
            end: {
                dateTime: params.endDateTime,
                timeZone,
            },
            ...(params.location
                ? {
                    location: {
                        displayName: params.location,
                    },
                }
                : {}),
            ...(params.categories?.length
                ? { categories: params.categories }
                : {}),
            ...(params.attendees?.length
                ? { attendees: params.attendees }
                : {}),
        };
        return client
            .api(`/users/${this.supportEmail}/events`)
            .header("Prefer", `outlook.timezone="${timeZone}"`)
            .post(payload);
    }
    async updateCalendarEvent(eventId, params) {
        const client = await this.getClient();
        const timeZone = "America/Santiago";
        const payload = {};
        if (params.subject !== undefined) {
            payload.subject = params.subject;
        }
        if (params.bodyHtml !== undefined) {
            payload.body = {
                contentType: "HTML",
                content: params.bodyHtml,
            };
        }
        if (params.startDateTime !== undefined) {
            payload.start = {
                dateTime: params.startDateTime,
                timeZone,
            };
        }
        if (params.endDateTime !== undefined) {
            payload.end = {
                dateTime: params.endDateTime,
                timeZone,
            };
        }
        if (params.location !== undefined) {
            payload.location = {
                displayName: params.location,
            };
        }
        if (params.categories !== undefined) {
            payload.categories = params.categories;
        }
        if (params.attendees !== undefined) {
            payload.attendees = params.attendees;
        }
        return client
            .api(`/users/${this.supportEmail}/events/${encodeURIComponent(eventId)}`)
            .header("Prefer", `outlook.timezone="${timeZone}"`)
            .patch(payload);
    }
    async deleteCalendarEvent(eventId) {
        const client = await this.getClient();
        await client
            .api(`/users/${this.supportEmail}/events/${encodeURIComponent(eventId)}`)
            .delete();
    }
}
/* ======================================================
   Export
====================================================== */
export const graphReaderService = new GraphReaderService();
//# sourceMappingURL=graph-reader.service.js.map