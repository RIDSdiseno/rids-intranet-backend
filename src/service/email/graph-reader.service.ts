import { Client } from '@microsoft/microsoft-graph-client';
import { ClientSecretCredential } from '@azure/identity';
import 'isomorphic-fetch';
import { runAI } from "../../utils/ai.js";
import { detectArea } from "../../controllers/tickets-rids/ticket-area.utils.js";
import { type TicketArea } from '../../controllers/tickets-rids/ticket-area.keywords.js';

import { prisma } from '../../lib/prisma.js';
import crypto from 'crypto';

import {
    TicketStatus,
    TicketPriority,
    TicketEventType,
    TicketActorType,
    MessageDirection,
    TicketChannel,
} from '@prisma/client';

import { bus } from "../../lib/events.js";

import cloudinary from "../../config/cloudinary.js";
import { Readable } from "stream";


/* ======================================================
   Tipos
====================================================== */
interface ParsedEmail {
    fromEmail: string;
    fromName: string;
    subject: string;
    bodyText: string;
    bodyHtml: string;
    messageId: string;
    conversationId: string;
    cc: string[];
    graphMessageId: string;
    attachmentsMeta: Array<{
        graphAttachmentId: string;
        filename: string;
        mimeType: string;
        bytes: number;
        contentId: string | null;  // ✅ Añadir
        isInline: boolean;   // ✅ Añadir
    }>;
}

/* ======================================================
   Servicio Graph Reader
====================================================== */
class GraphReaderService {
    private client: Client | null = null;
    private supportEmail: string;

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
    async getClient(): Promise<Client> {
        if (this.client) return this.client;

        const credential = new ClientSecretCredential(
            process.env.MICROSOFT_TENANT_ID!,
            process.env.MICROSOFT_CLIENT_ID!,
            process.env.MICROSOFT_CLIENT_SECRET!
        );

        this.client = Client.init({
            authProvider: async (done) => {
                try {
                    const token = await credential.getToken(
                        'https://graph.microsoft.com/.default'
                    );
                    done(null, token.token);
                } catch (err) {
                    done(err as Error, null);
                }
            },
        });

        return this.client;
    }

    /* ======================================================
       Lectura de correos
    ====================================================== */
    async readUnreadEmails(): Promise<void> {
        try {
            console.log('🔐 Conectando a Microsoft Graph API...');

            const client = await this.getClient();

            const response = await client
                .api(`/users/${this.supportEmail}/messages`)
                .filter('isRead eq false')
                .select(
                    'id,subject,from,toRecipients,ccRecipients,body,receivedDateTime,internetMessageId,conversationId,hasAttachments'
                )
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

                } catch (err) {
                    console.error('❌ Error procesando mensaje:', err);
                }
            }

            console.log('✅ Procesamiento de correos finalizado');
        } catch (err: any) {
            console.error('❌ Error en Graph API:', err.message);
            throw err;
        }
    }

    // ... otros métodos (fetchAttachmentsMeta, stripHtml, createOrUpdateTicket, etc.) ...

    /* ======================================================
       Guardar adjuntos
    ====================================================== */
    private async saveAttachments(
        ticketId: number,
        messageId: number,
        data: ParsedEmail
    ) {
        if (!data.attachmentsMeta?.length) return;

        for (const att of data.attachmentsMeta) {
            const buffer = await this.downloadAttachment(
                data.graphMessageId,
                att.graphAttachmentId
            );

            if (!buffer) continue;

            const safeName = att.filename.replace(/[^\w.\-]/g, "_");

            // 🔥 Subir a Cloudinary usando stream
            const uploadResult = await new Promise<any>((resolve, reject) => {
                const stream = cloudinary.uploader.upload_stream(
                    {
                        folder: `rids/helpdesk/tickets/${ticketId}`,
                        resource_type: "auto",
                        public_id: `email_${ticketId}_${Date.now()}`,
                    },
                    (error, result) => {
                        if (error) reject(error);
                        else resolve(result);
                    }
                );

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
    private async processMessage(message: any): Promise<void> {
        const fromEmail =
            message.from?.emailAddress?.address?.toLowerCase() || '';

        const fromName =
            message.from?.emailAddress?.name ||
            fromEmail.split('@')[0] ||
            'Desconocido';

        const graphMessageId = message.id; // ESTE ES CLAVE

        const attachmentsMeta =
            message.hasAttachments ? await this.fetchAttachmentsMeta(graphMessageId) : [];

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
        const toAddresses =
            message.toRecipients?.map((r: any) =>
                r.emailAddress.address.toLowerCase()
            ) || [];

        const ccAddresses =
            message.ccRecipients?.map((r: any) =>
                r.emailAddress.address.toLowerCase()
            ) || [];

        const isToSupport =
            toAddresses.includes(this.supportEmail) ||
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

        const bodyText =
            message.body?.contentType === 'text'
                ? message.body.content
                : this.stripHtml(bodyHtml);

        const emailData: ParsedEmail = {
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
    private async fetchAttachmentsMeta(graphMessageId: string) {
        const client = await this.getClient();

        const res = await client
            .api(`/users/${this.supportEmail}/messages/${graphMessageId}/attachments`)
            .top(50)
            .get();

        const items = res.value ?? [];

        return items.map((a: any) => {
            let contentId: string | null = null;

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
    private stripHtml(html: string): string {
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
    private async createOrUpdateTicket(data: ParsedEmail): Promise<void> {
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
        if (!domain) return;

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

        // 1. Preparar variables
        const mockTicket = { subject: data.subject, messages: [{ bodyText: data.bodyText }] } as any;
        const area = detectArea(mockTicket) || "SOPORTE";
        const conf = await (prisma as any).areaConfig.findUnique({ where: { nombre: area } });
        let aiSummary = conf?.mensajeBase || "Revisaremos tu caso.";

        // 2. Ejecutar IA
        try {
            const resAI = await runAI({ userText: `Área: ${area}. Reporte: "${data.bodyText}". Respuesta (máx 30 palabras).`, context: { from: "system", transcript: [], email: data.fromEmail } });
            if (resAI) aiSummary = resAI.replace(/^"|"$/g, '');
        } catch (e) {}

        // 3. Crear Ticket
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
        aiSummary,
        area: area
    },
});

        // Agregar primer mensaje
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

        await this.saveAttachments(ticket.id, msg.id, data);

        bus.emit("ticket.created", {
            id: ticket.id,
            publicId: ticket.publicId,
            subject: ticket.subject,
            empresaId: ticket.empresaId,
            priority: ticket.priority,
            channel: TicketChannel.EMAIL,
            from: data.fromEmail,
            aiSummary,
        });



        console.log(`✅ Ticket #${ticket.id} creado (${empresa.nombre})`);
    }

    /* ======================================================
       Buscar ticket existente
    ====================================================== */
    private async findExistingTicket(data: ParsedEmail): Promise<any> {
        if (data.conversationId) {
            const ticket = await prisma.ticket.findFirst({
                where: {
                    messages: { some: { sourceInReplyTo: data.conversationId } },
                    status: { not: TicketStatus.CLOSED },
                },
            });
            if (ticket) return ticket;
        }

        const match = data.subject.match(/#(\d+)/);

        if (match?.[1]) {
            const ticketId = Number(match[1]);

            // 🔐 Protección crítica ANTES de tocar Prisma
            if (
                Number.isInteger(ticketId) &&
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
            } else {
                console.warn(
                    `⚠️ ID ignorado por tamaño inválido: ${match[1]}`
                );
            }
        }

        return null;
    }

    /* ======================================================
       Agregar mensaje a ticket
    ====================================================== */
    private async addMessageToTicket(ticketId: number, data: ParsedEmail) {
        const msg = await prisma.$transaction(async (tx) => {
            const newMessage = await tx.ticketMessage.create({ data: { ticketId, direction: MessageDirection.INBOUND, bodyText: data.bodyText, bodyHtml: data.bodyHtml, isInternal: false, fromEmail: data.fromEmail, toEmail: this.supportEmail, cc: data.cc.length ? data.cc.join(",") : null, sourceMessageId: data.messageId, sourceInReplyTo: data.conversationId || null, sourceReferences: data.graphMessageId } });
            await tx.ticket.update({ where: { id: ticketId }, data: { status: "OPEN", lastActivityAt: new Date() } });
            await tx.ticketEvent.create({ data: { ticketId, type: TicketEventType.MESSAGE_SENT, actorType: TicketActorType.REQUESTER } });
            return newMessage;
    });

  await this.saveAttachments(ticketId, msg.id, data);
  bus.emit("ticket.message", { ticketId, direction: "INBOUND", from: data.fromEmail, subject: data.subject });
  bus.emit("ticket.updated", { ticketId, changes: { status: "OPEN" } });
}
    /* ======================================================
       Prioridad
    ====================================================== */
    private detectPriority(subject: string, body: string): TicketPriority {
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
    private async downloadAttachment(
        graphMessageId: string,
        attachmentId: string
    ): Promise<Buffer | null> {
        const client = await this.getClient();

        const res = await client
            .api(
                `/users/${this.supportEmail}/messages/${graphMessageId}/attachments/${attachmentId}`
            )
            .get();

        // Solo fileAttachment tiene contenido
        if (
            res['@odata.type'] === '#microsoft.graph.fileAttachment' &&
            res.contentBytes
        ) {
            return Buffer.from(res.contentBytes, 'base64');
        }

        return null;
    }

    // Método para enviar email de respuesta (usado en respuestas desde el frontend, etc.)
    async sendReplyEmail(params: {
        to: string;
        subject: string;
        bodyHtml: string;
        bodyText?: string;
        inReplyTo?: string;
        references?: string;
    }) {
        const client = await this.getClient();

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
    }

}

/* ======================================================
   Export
====================================================== */
export const graphReaderService = new GraphReaderService();