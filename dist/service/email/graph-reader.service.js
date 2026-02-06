import { Client } from '@microsoft/microsoft-graph-client';
import { ClientSecretCredential } from '@azure/identity';
import 'isomorphic-fetch';
import { prisma } from '../../lib/prisma.js';
import crypto from 'crypto';
import { TicketStatus, TicketPriority, TicketEventType, TicketActorType, MessageDirection, TicketChannel, } from '@prisma/client';
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
            const response = await client
                .api(`/users/${this.supportEmail}/messages`)
                .filter('isRead eq false')
                .select('id,subject,from,toRecipients,ccRecipients,body,receivedDateTime,internetMessageId,conversationId,hasAttachments')
                .top(50)
                .orderby('receivedDateTime desc')
                .get();
            const messages = response.value ?? [];
            if (messages.length === 0) {
                console.log('📭 No hay emails sin leer');
                return;
            }
            console.log(`📧 Encontrados ${messages.length} emails sin leer`);
            for (const message of messages) {
                try {
                    await this.processMessage(message);
                    await client
                        .api(`/users/${this.supportEmail}/messages/${message.id}`)
                        .patch({ isRead: true });
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
    /* ======================================================
       Procesar mensaje individual
    ====================================================== */
    async processMessage(message) {
        const fromEmail = message.from?.emailAddress?.address?.toLowerCase() || '';
        const fromName = message.from?.emailAddress?.name ||
            fromEmail.split('@')[0] ||
            'Desconocido';
        const graphMessageId = message.id; // ESTE ES CLAVE
        const attachmentsMeta = message.hasAttachments ? await this.fetchAttachmentsMeta(graphMessageId) : [];
        /* ------------------------------
           1️⃣ Ignorar correos internos
        ------------------------------ */
        if (fromEmail.endsWith('@rids.cl')) {
            console.log('⏭️ Ignorado: correo interno');
            return;
        }
        /* ------------------------------
           2️⃣ Validar que vaya a soporte
        ------------------------------ */
        const toAddresses = message.toRecipients?.map((r) => r.emailAddress.address.toLowerCase()) || [];
        const ccAddresses = message.ccRecipients?.map((r) => r.emailAddress.address.toLowerCase()) || [];
        const isToSupport = toAddresses.includes(this.supportEmail) ||
            ccAddresses.includes(this.supportEmail);
        if (!isToSupport) {
            console.log('⏭️ Ignorado: no dirigido a soporte');
            return;
        }
        /* ------------------------------
           3️⃣ Ignorar automáticos / spam
        ------------------------------ */
        const blockedSenders = [
            'postmaster@',
            'mailer-daemon',
            'no-reply',
            'noreply',
            'bounce',
        ];
        if (blockedSenders.some(b => fromEmail.includes(b))) {
            console.log('⏭️ Ignorado: correo automático');
            return;
        }
        /* ------------------------------
           4️⃣ Extraer cuerpo
        ------------------------------ */
        const bodyHtml = message.body?.content || '';
        const bodyText = message.body?.contentType === 'text'
            ? message.body.content
            : this.stripHtml(bodyHtml);
        const emailData = {
            fromEmail,
            fromName,
            subject: message.subject || 'Sin asunto',
            bodyText,
            bodyHtml,
            messageId: message.internetMessageId || '',
            conversationId: message.conversationId || '',
            cc: ccAddresses,
            graphMessageId,
            attachmentsMeta,
        };
        console.log(`📨 Procesando: ${emailData.fromEmail} - ${emailData.subject}`);
        await this.createOrUpdateTicket(emailData);
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
    async createOrUpdateTicket(data) {
        // buscar ticket existente (reply)
        const existingTicket = await this.findExistingTicket(data);
        if (existingTicket) {
            await this.addMessageToTicket(existingTicket.id, data);
            console.log(`✅ Mensaje agregado al ticket #${existingTicket.id}`);
            return;
        }
        /* ------------------------------
           Crear ticket nuevo
        ------------------------------ */
        const domain = data.fromEmail.split('@')[1];
        if (!domain)
            return;
        let empresa = await prisma.empresa.findFirst({
            where: { dominios: { has: domain } },
        });
        if (!empresa) {
            empresa = await prisma.empresa.findFirst({
                where: { nombre: 'SIN CLASIFICAR' },
            });
            console.log(`⚠️ Dominio ${domain} no reconocido → SIN CLASIFICAR`);
        }
        if (!empresa) {
            throw new Error('Empresa SIN CLASIFICAR no existe');
        }
        // 🔍 Buscar solicitante EXISTENTE (NO crear)
        const requester = await prisma.solicitante.findFirst({
            where: {
                email: data.fromEmail,
                empresaId: empresa.id_empresa,
            },
        });
        // ⚠️ Solo log, NO crear
        if (!requester) {
            console.warn(`⚠️ Solicitante no registrado: ${data.fromEmail}`);
        }
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
        const msg = await prisma.ticketMessage.create({
            data: {
                ticketId: ticket.id,
                direction: MessageDirection.INBOUND,
                bodyText: data.bodyText,
                bodyHtml: data.bodyHtml,
                isInternal: false,
                fromEmail: data.fromEmail,
                cc: data.cc.length ? data.cc.join(",") : null,
                toEmail: this.supportEmail,
                sourceMessageId: data.messageId,
                sourceInReplyTo: data.conversationId || null,
                sourceReferences: data.graphMessageId,
            },
        });
        if (data.attachmentsMeta?.length) {
            await prisma.ticketAttachment.createMany({
                data: data.attachmentsMeta.map((a) => ({
                    messageId: msg.id,
                    filename: a.filename,
                    mimeType: a.mimeType,
                    bytes: a.bytes,
                    url: a.graphAttachmentId,
                    isInline: a.isInline, // ✅ Guardar
                    contentId: a.contentId ?? null, // ✅ Guardar
                })),
            });
        }
        console.log(`✅ Ticket #${ticket.id} creado (${empresa.nombre})`);
    }
    /* ======================================================
       Buscar ticket existente
    ====================================================== */
    async findExistingTicket(data) {
        if (data.conversationId) {
            const ticket = await prisma.ticket.findFirst({
                where: {
                    messages: { some: { sourceInReplyTo: data.conversationId } },
                    status: { not: TicketStatus.CLOSED },
                },
            });
            if (ticket)
                return ticket;
        }
        const match = data.subject.match(/#(\d+)/);
        if (match?.[1]) {
            const ticketId = Number(match[1]);
            // 🔐 Protección crítica ANTES de tocar Prisma
            if (Number.isInteger(ticketId) &&
                ticketId > 0 &&
                ticketId <= 2_147_483_647 // límite INT4
            ) {
                return prisma.ticket.findFirst({
                    where: {
                        id: ticketId,
                        fromEmail: data.fromEmail,
                        status: { not: TicketStatus.CLOSED },
                    },
                });
            }
            else {
                console.warn(`⚠️ ID ignorado por tamaño inválido: ${match[1]}`);
            }
        }
        return null;
    }
    /* ======================================================
       Agregar mensaje a ticket
    ====================================================== */
    async addMessageToTicket(ticketId, data) {
        await prisma.$transaction(async (tx) => {
            const msg = await tx.ticketMessage.create({
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
                    sourceInReplyTo: data.conversationId || null,
                    sourceReferences: data.graphMessageId,
                },
            });
            // ✅ adjuntos (metadata) para replies también
            if (data.attachmentsMeta?.length) {
                await tx.ticketAttachment.createMany({
                    data: data.attachmentsMeta.map((a) => ({
                        messageId: msg.id,
                        filename: a.filename,
                        mimeType: a.mimeType,
                        bytes: a.bytes,
                        url: a.graphAttachmentId,
                        isInline: a.isInline, // ✅ Guardar
                        contentId: a.contentId ?? null, // ✅ Guardar
                    })),
                });
            }
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
}
/* ======================================================
   Export
====================================================== */
export const graphReaderService = new GraphReaderService();
//# sourceMappingURL=graph-reader.service.js.map