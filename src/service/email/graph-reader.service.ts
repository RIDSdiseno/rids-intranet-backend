import { Client } from '@microsoft/microsoft-graph-client';
import { ClientSecretCredential } from '@azure/identity';
import 'isomorphic-fetch';

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

import { emailSenderService } from '../email/email-sender.service.js';

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
    references?: string; // 🆕
    inReplyTo?: string;
    attachmentsMeta: Array<{
        graphAttachmentId: string;
        filename: string;
        mimeType: string;
        bytes: number;
        contentId: string | null;  // ✅ Añadir
        isInline: boolean;   // ✅ Añadir
    }>;
}

type GraphHeader = {
    name: string;
    value: string;
};

function buildAutoReplyTemplate(params: {
    nombre: string;
    ticketId: number;
    subject: string;
    bodyOriginal: string;
    nombreTecnico?: string;
}) {
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
    private client: Client | null = null;
    private supportEmail: string;

    private normalizeSubject(subject: string): string {
        return (subject || "")
            .replace(/^\s*((re|fw|fwd)\s*:\s*)+/i, "")
            .replace(/\s+/g, " ")
            .trim()
            .toLowerCase();
    }

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
    async readInboxEmails(): Promise<void> {
        try {
            console.log('🔐 Conectando a Microsoft Graph API...');

            const client = await this.getClient();

            // Lee una ventana más amplia para no perder correos
            const minutes = 30;
            const since = new Date(Date.now() - minutes * 60 * 1000);

            const response = await client
                .api(`/users/${this.supportEmail}/mailFolders/inbox/messages`)
                .filter(`receivedDateTime ge ${since.toISOString()}`)
                .select(
                    'id,subject,from,toRecipients,ccRecipients,body,isRead,receivedDateTime,internetMessageId,conversationId,hasAttachments,internetMessageHeaders'
                )
                .top(200)
                .orderby('receivedDateTime desc')
                .get();

            const messages = response.value ?? [];

            console.log(`📥 Correos recientes encontrados: ${messages.length}`);

            if (messages.length === 0) {
                console.log('📭 No hay correos recientes');
                return;
            }

            const seen = new Set<string>();
            const uniqueMessages = messages.filter((msg: any) => {
                const dedupeId = msg.internetMessageId || msg.id;

                if (seen.has(dedupeId)) return false;
                seen.add(dedupeId);

                if (!msg.internetMessageId) {
                    console.warn(`⚠️ Mensaje sin internetMessageId, se usará Graph ID: ${msg.id}`);
                }

                return true;
            });

            console.log(`📥 Correos únicos a procesar: ${uniqueMessages.length}`);

            for (const message of uniqueMessages) {
                try {
                    console.log(
                        `📨 Revisando email: ${message.subject || 'Sin asunto'} | isRead=${message.isRead}`
                    );

                    await this.processMessage(message);
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
        const graphMessageId = message.id;

        // 🔥 ID REAL DEL EMAIL (CLAVE)
        const internetMessageId = message.internetMessageId || `<graph-${message.id}@local>`;

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

        if (fromEmail === this.supportEmail) {
            console.log(`⏭️ Ignorado: mensaje enviado por soporte (${fromEmail})`);
            return;
        }

        const fromName =
            message.from?.emailAddress?.name ||
            fromEmail.split('@')[0] ||
            'Desconocido';

        const subject = message.subject || 'Sin asunto';

        /* =============================
   🔥 HEADERS (THREADING REAL)
============================= */
        const headers = message.internetMessageHeaders as GraphHeader[] | undefined;

        const references = headers?.find((h: GraphHeader) => h.name === "References")?.value;
        const inReplyTo = headers?.find((h: GraphHeader) => h.name === "In-Reply-To")?.value;

        /* =============================
           3️⃣ VALIDAR DESTINATARIO
        ============================= */
        const toAddresses =
            message.toRecipients?.map((r: any) =>
                (r.emailAddress.address || '').toLowerCase()
            ) || [];

        const ccAddresses =
            message.ccRecipients?.map((r: any) =>
                (r.emailAddress.address || '').toLowerCase()
            ) || [];

        console.log("📨 To:", toAddresses);
        console.log("📨 Cc:", ccAddresses);
        console.log("📨 SupportEmail:", this.supportEmail);

        const isToSupport =
            toAddresses.includes(this.supportEmail) ||
            ccAddresses.includes(this.supportEmail);

        // Si el correo ya está en el inbox del buzón de soporte, no lo descartes solo por no venir explícito en To/Cc.
        // Esto ayuda con alias, redirecciones, shared mailbox y BCC.
        if (!isToSupport) {
            console.warn(`⚠️ Email recibido en inbox pero no coincide en To/Cc con soporte. Se procesará igual.`);
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

        const bodyText =
            message.body?.contentType === 'text'
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

        if (
            autoPatterns.some(p => bodyLower.includes(p)) ||
            subjectLower.includes('assigned to your group') ||
            subjectLower.includes('ticket has been assigned')
        ) {
            console.log(`⏭️ Ignorado: notificación automática (${fromEmail})`);
            return;
        }

        /* =============================
           7️⃣ DETECTAR INTERNOS (MULTI DOMINIO)
        ============================= */
        const internalDomains = ['rids.cl'];

        const isInternal = internalDomains.some(d =>
            fromEmail.endsWith(`@${d}`)
        );

        /* =============================
           8️⃣ CONSTRUIR DATA
        ============================= */
        const emailData: ParsedEmail = {
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
            } catch (err) {
                console.error('⚠️ Error obteniendo adjuntos:', err);
                emailData.attachmentsMeta = [];
            }
        }

        /* =============================
   1️⃣1️⃣ PROCESAR
============================= */
        console.log(`📨 Procesando: ${fromEmail} - ${subject}`);

        await this.createOrUpdateTicket(emailData, existingTicket);

        // 🔥 Marcar como leído para evitar reprocesamiento
        try {
            const client = await this.getClient();
            await client
                .api(`/users/${this.supportEmail}/messages/${graphMessageId}`)
                .patch({ isRead: true });
        } catch (err) {
            console.warn("⚠️ No se pudo marcar email como leído:", err);
        }
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
    private async createOrUpdateTicket(
        data: ParsedEmail,
        existingTicket?: any
    ): Promise<void> {

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

        if (!domain) return;

        let empresa: { nombre: string; id_empresa: number; tieneSucursales: boolean; razonSocial: string | null; dominios: string[] } | null = null;

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
        let ticket: any;
        let msg: any;

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

        } catch (err: any) {
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
            let tecnico: {
                nombre: string;
                email: string;
                firma: { path: string } | null;
            } | null = null;

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
                    bodyHtml: htmlFinal,
                    isInternal: false,
                    fromEmail: this.supportEmail,
                    toEmail: data.fromEmail,
                    sourceMessageId: `<auto-reply-${ticket.id}-${Date.now()}@rids.cl>`, // 🆕
                    sourceInReplyTo: data.messageId,                                     // 🆕
                },
            });

            console.log(`✅ Auto-reply enviado correctamente a ${data.fromEmail}`);

        } catch (err: any) {
            console.error("❌ ERROR REAL GRAPH:");
            console.error(JSON.stringify(err?.body || err, null, 2));
        }

        console.log(`✅ Ticket #${ticket.id} creado (${empresa.nombre})`);
    }

    /* ======================================================
       Buscar ticket existente
    ====================================================== */
    private async findExistingTicket(data: ParsedEmail): Promise<any> {
        /* =============================
           1️⃣ POR HEADERS (REAL THREADING)
        ============================= */
        const orConditions: any[] = [];

        if (data.inReplyTo) {
            orConditions.push({
                sourceMessageId: data.inReplyTo.trim()
            });
        }

        if (data.references) {
            const refs = data.references.split(" ");

            for (const ref of refs) {
                const cleanRef = ref.trim();
                if (!cleanRef) continue;

                orConditions.push({
                    sourceMessageId: cleanRef
                });
            }
        }

        if (orConditions.length > 0) {
            const ticket = await prisma.ticket.findFirst({
                where: {
                    status: { not: TicketStatus.CLOSED },
                    messages: {
                        some: {
                            OR: orConditions
                        }
                    },
                },
                orderBy: { lastActivityAt: "desc" }
            });

            if (ticket) return ticket;
        }

        /* =============================
           2️⃣ FALLBACK POR SUBJECT (#ID)
        ============================= */
        const match = data.subject.match(/Ticket\s+#(\d+)/i);

        if (match?.[1]) {
            const ticketId = Number(match[1]);

            if (
                !Number.isInteger(ticketId) ||
                ticketId <= 0 ||
                ticketId > 2147483647
            ) {
                console.warn(`⚠️ ID inválido detectado en subject: ${match[1]}`);
                return null;
            }

            const ticket = await prisma.ticket.findFirst({
                where: {
                    id: ticketId,
                    status: { not: TicketStatus.CLOSED },
                }
            });

            if (ticket) return ticket;
        }

        /* =============================
           3️⃣ FALLBACK POR REMITENTE + SUBJECT NORMALIZADO
        ============================= */
        const normalizedSubject = this.normalizeSubject(data.subject);

        const recentTickets = await prisma.ticket.findMany({
            where: {
                fromEmail: data.fromEmail,
                status: { not: TicketStatus.CLOSED },
                createdAt: {
                    gte: new Date(Date.now() - 24 * 60 * 60 * 1000),
                },
            },
            orderBy: { createdAt: "desc" },
            take: 10,
        });

        for (const ticket of recentTickets) {
            const normalizedTicketSubject = this.normalizeSubject(ticket.subject);

            if (normalizedTicketSubject === normalizedSubject) {
                return ticket;
            }
        }

        return null;
    }

    /* ======================================================
       Agregar mensaje a ticket
    ====================================================== */
    private async addMessageToTicket(ticketId: number, data: ParsedEmail) {

        const ticketBase = await prisma.ticket.findUnique({
            where: { id: ticketId },
            select: {
                empresaId: true,
                requesterId: true,
            },
        });

        let requester = await prisma.solicitante.findFirst({
            where: {
                email: data.fromEmail,
                isActive: true,
                ...(ticketBase?.empresaId && { empresaId: ticketBase.empresaId }),
            },
            select: {
                id_solicitante: true,
                nombre: true,
                email: true,
            },
        });

        // 1) DB rápido (sin adjuntos)
        const msg = await prisma.$transaction(async (tx) => {
            // ✅ DEDUPE primero para que no duplique nada
            const exists = await tx.ticketMessage.findUnique({
                where: { sourceMessageId: data.messageId },
                select: { id: true },
            });
            if (exists) return null;

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
                data: {
                    lastActivityAt: new Date(),
                    fromEmail: data.fromEmail,
                    ...(requester?.id_solicitante && {
                        requesterId: requester.id_solicitante,
                    }),
                },
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
        if (!msg) return;

        // 2) Adjuntos FUERA de la transacción (lento)
        try {
            await this.saveAttachments(ticketId, msg.id, data);
        } catch (e) {
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

        bus.emit("ticket.customer_replied", {
            ticketId,
            subject: data.subject,
            fromEmail: data.fromEmail,
            fromName: data.fromName,
            direction: "INBOUND",
            lastActivityAt: new Date(),
        });

        bus.emit("ticket.updated", {
            ticketId,
            source: "customer_reply",
            lastActivityAt: new Date(),
        });
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
        to: string | string[];
        cc?: string[];
        subject: string;
        bodyHtml: string;
    }) {
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
                        emailAddress: { address }
                    })),
                    ccRecipients: ccRecipients.map(address => ({
                        emailAddress: { address }
                    })),
                },
                saveToSentItems: true,
            });

        console.log("✅ Graph sendMail ejecutado");
    }

    private toSantiagoDateTime(dateTime: string, timeZone: string): string {
        const SANTIAGO_TZ = "America/Santiago";
        const SANTIAGO_WINDOWS = "Pacific SA Standard Time";

        if (!dateTime) return "";

        // Graph devolvió la hora ya en Santiago → usar directo
        if (timeZone === SANTIAGO_TZ || timeZone === SANTIAGO_WINDOWS) {
            return dateTime.slice(0, 16);
        }

        // Cualquier otro timezone (incluyendo UTC) → convertir a Santiago
        const utcString = dateTime.endsWith("Z") ? dateTime : `${dateTime}Z`;
        const date = new Date(utcString);

        if (isNaN(date.getTime())) return dateTime.slice(0, 16);

        const parts = new Intl.DateTimeFormat("en-CA", {
            timeZone: SANTIAGO_TZ,
            year: "numeric",
            month: "2-digit",
            day: "2-digit",
            hour: "2-digit",
            minute: "2-digit",
            hour12: false,
        }).formatToParts(date);

        const get = (type: string) => parts.find(p => p.type === type)?.value ?? "00";
        return `${get("year")}-${get("month")}-${get("day")}T${get("hour")}:${get("minute")}`;
    }

    async readCalendarEvents(startDateTime: string, endDateTime: string): Promise<Array<{
        id: string;
        subject: string;
        start: string;
        end: string;
        categories: string[];
        body: string;
        attendees: Array<{
            emailAddress: { address?: string; name?: string };
            type?: string;
        }>;
    }>> {
        try {
            const client = await this.getClient();

            const allEvents: any[] = [];

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

            return allEvents.map((event: any) => ({
                id: event.id || "",
                subject: event.subject || "",
                start: this.toSantiagoDateTime(event.start?.dateTime || "", event.start?.timeZone || "UTC"),
                end: this.toSantiagoDateTime(event.end?.dateTime || "", event.end?.timeZone || "UTC"),
                categories: event.categories || [],
                body: event.body?.content || "",
                attendees: event.attendees || [],
            }));
        } catch (err) {
            console.error("[GRAPH CALENDAR READ] Error leyendo eventos:", err);
            return [];
        }
    }

    async createCalendarEvent(params: {
        subject: string;
        bodyHtml?: string;
        startDateTime: string;
        endDateTime: string;
        location?: string;
        categories?: string[];
        attendees?: Array<{
            emailAddress: {
                address: string;
                name?: string;
            };
            type?: "required" | "optional";
        }>;
    }): Promise<any> {
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

    async updateCalendarEvent(
        eventId: string,
        params: {
            subject?: string;
            bodyHtml?: string;
            startDateTime?: string;
            endDateTime?: string;
            location?: string;
            categories?: string[];
            attendees?: Array<{
                emailAddress: {
                    address: string;
                    name?: string;
                };
                type?: "required" | "optional";
            }>;
        }
    ): Promise<any> {
        const client = await this.getClient();
        const timeZone = "America/Santiago";

        const payload: any = {};

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

    async deleteCalendarEvent(eventId: string): Promise<void> {
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
