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
<body style="margin:0; padding:0; background:#f5f5f5; font-family: Arial, sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f5f5f5; padding:20px 0;">
  <tr><td align="center">
    <table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff; border-radius:8px; overflow:hidden;">

      <!-- HEADER -->
      <tr>
        <td style="background:#0f172a; padding:16px 24px;">
          <strong style="color:white; font-size:16px;">Soluciones RIDS — Soporte Técnico</strong>
        </td>
      </tr>

      <!-- BODY -->
      <tr>
        <td style="padding:24px; font-size:14px; color:#333; line-height:1.6;">
          <p>Estimado(a) <strong>${params.nombre}</strong>,</p>
          <p>Hemos recibido tu solicitud. Te asignamos el siguiente número de ticket:</p>

          <div style="text-align:center; margin:20px 0;">
            <span style="
              display:inline-block;
              background:#0ea5e9;
              color:white;
              font-size:22px;
              font-weight:bold;
              padding:10px 28px;
              border-radius:6px;
              letter-spacing:1px;
            ">
              Ticket #${params.ticketId}
            </span>
          </div>

          <p><strong>Asunto:</strong> ${params.subject}</p>
          <p>Nuestro equipo revisará tu caso a la brevedad. Puedes responder directamente a este correo para agregar más información.</p>
        </td>
      </tr>

      <!-- MENSAJE ORIGINAL -->
      <tr>
        <td style="padding:0 24px 24px;">
          <div style="border-left:3px solid #e2e8f0; padding-left:12px; color:#64748b; font-size:13px;">
            <p style="margin:0 0 8px; font-weight:bold;">Tu mensaje:</p>
            <div>${params.bodyOriginal}</div>
          </div>
        </td>
      </tr>

      <!-- FOOTER -->
      <tr>
        <td style="background:#f8fafc; padding:16px 24px; font-size:12px; color:#94a3b8; border-top:1px solid #e2e8f0;">
          Soporte Técnico · Soluciones RIDS · soporte@rids.cl
        </td>
      </tr>

    </table>
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
        const fromEmail = message.from?.emailAddress?.address?.toLowerCase() || '';
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
           4️⃣ CREAR TICKET
        ============================= */
        const ticket = await prisma.ticket.create({
            data: {
                publicId: crypto.randomUUID(),
                subject: data.subject,
                status: TicketStatus.OPEN,
                priority: this.detectPriority(data.subject, data.bodyText),
                channel: TicketChannel.EMAIL,
                empresaId: empresa.id_empresa,
                requesterId: requester?.id_solicitante ?? null,
                fromEmail: data.fromEmail,
                inboxEmail: this.supportEmail,
                lastActivityAt: new Date(),
            },
        });
        /* =============================
           5️⃣ CREAR PRIMER MENSAJE (DEDUP SAFE)
        ============================= */
        let msg;
        try {
            msg = await prisma.ticketMessage.create({
                data: {
                    ticketId: ticket.id,
                    direction: MessageDirection.INBOUND,
                    bodyText: data.bodyText,
                    bodyHtml: data.bodyHtml,
                    isInternal: false,
                    fromEmail: data.fromEmail,
                    cc: data.cc.length ? data.cc.join(",") : null,
                    toEmail: this.supportEmail,
                    sourceMessageId: data.messageId, // internetMessageId
                    sourceInReplyTo: data.inReplyTo || null,
                    sourceReferences: data.references || null,
                },
            });
        }
        catch (err) {
            // 🔥 PROTECCIÓN CRÍTICA CONTRA DUPLICADOS
            if (err.code === 'P2002') {
                console.log(`⏭️ Mensaje ya existe (sourceMessageId duplicado)`);
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
   8️⃣ AUTO-REPLY (GRAPH CORRECTO)
============================= */
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
            // ✅ 2. Evitar auto-envío
            if (data.fromEmail === this.supportEmail) {
                console.warn("⚠️ Email es el mismo soporte, se omite auto-reply");
                return;
            }
            const html = buildAutoReplyTemplate({
                nombre: data.fromName || "Cliente",
                ticketId: ticket.id,
                subject: ticket.subject,
                bodyOriginal: data.bodyHtml || data.bodyText,
            });
            console.log("📨 TO:", data.fromEmail);
            console.log("📨 FROM:", this.supportEmail);
            await this.sendReplyEmail({
                to: data.fromEmail,
                subject: `Re: ${ticket.subject}`,
                bodyHtml: html,
                inReplyTo: data.messageId,
                references: data.references || data.messageId,
            });
            // ✅ Registrar mensaje interno
            await prisma.ticketMessage.create({
                data: {
                    ticketId: ticket.id,
                    direction: MessageDirection.OUTBOUND,
                    bodyText: 'Correo automático de confirmación enviado',
                    isInternal: true,
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
                    status: { not: TicketStatus.CLOSED }
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
                    status: { not: TicketStatus.CLOSED }
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
                    status: { not: TicketStatus.CLOSED }
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
        console.log("📤 Enviando email vía Graph...");
        await client
            .api(`/users/${this.supportEmail}/sendMail`)
            .post({
            message: {
                subject: params.subject,
                body: {
                    contentType: "HTML",
                    content: params.bodyHtml,
                },
                toRecipients: [
                    {
                        emailAddress: {
                            address: params.to,
                        },
                    },
                ],
                internetMessageHeaders: [
                    ...(params.inReplyTo
                        ? [{ name: "In-Reply-To", value: params.inReplyTo }]
                        : []),
                    ...(params.references
                        ? [{ name: "References", value: params.references }]
                        : []),
                ],
            },
            saveToSentItems: true,
        });
        console.log("✅ Graph sendMail ejecutado");
    }
}
/* ======================================================
   Export
====================================================== */
export const graphReaderService = new GraphReaderService();
//# sourceMappingURL=graph-reader.service.js.map