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

import { ticketEmailTemplateService } from "../email/reply-templates/ticket-email-template.service.js";

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
    to: string[];
    cc: string[];
    graphMessageId: string;
    references?: string;
    inReplyTo?: string;
    attachmentsMeta: Array<{
        graphAttachmentId: string;
        odataType?: string | null;
        filename: string;
        mimeType: string;
        bytes: number;
        contentId: string | null;
        isInline: boolean;
    }>;
}

type GraphHeader = {
    name: string;
    value: string;
};

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

            // Filtra por fecha de recepción para evitar leer todo el inbox cada vez
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

            // Deduplicar mensajes por internetMessageId (o id de Graph si no hay internetMessageId), para evitar reprocesar el mismo correo si la función se ejecuta varias veces en paralelo o si Microsoft envía duplicados.
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
            console.log("💾 Intentando guardar adjunto:", {
                graphAttachmentId: att.graphAttachmentId,
                filename: att.filename,
                mimeType: att.mimeType,
                isInline: att.isInline,
                contentId: att.contentId,
            });

            const buffer = await this.downloadAttachment(
                data.graphMessageId,
                att.graphAttachmentId
            );

            console.log(
                "📥 Resultado downloadAttachment:",
                att.filename,
                buffer ? `OK (${buffer.length} bytes)` : "NULL"
            );

            if (!buffer) continue;

            //  Subir a Cloudinary usando stream
            const safeName = att.filename.replace(/[^\w.\-]/g, "_");
            const extension = safeName.split(".").pop()?.toLowerCase() || "";

            const rawExtensions = [
                "xlsx",
                "xls",
                "csv",
                "doc",
                "docx",
                "ppt",
                "pptx",
                "zip",
                "rar",
                "7z",
                "txt",
                "pdf",
            ];

            const resourceType: "raw" | "auto" =
                rawExtensions.includes(extension) ? "raw" : "auto";

            const baseName = safeName.replace(/\.[^.]+$/, "");

            const uploadOptions = {
                folder: `rids/helpdesk/tickets/${ticketId}`,
                resource_type: resourceType,
                public_id: `email_${ticketId}_${Date.now()}_${baseName}`,
                use_filename: false,
                unique_filename: false,
                ...(resourceType === "raw" ? { format: extension } : {}),
            };

            const uploadResult = await new Promise<any>((resolve, reject) => {
                const stream = cloudinary.uploader.upload_stream(
                    uploadOptions,
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

    // Descargar adjunto desde Graph API
    private extractRemoteImages(html: string): string[] {
        if (!html) return [];

        const matches = [...html.matchAll(/<img[^>]+src=["'](https?:\/\/[^"']+)["'][^>]*>/gi)];

        const urls = matches
            .map((m) => m[1])
            .filter((url): url is string => typeof url === "string" && url.length > 0);

        return [...new Set(urls)];
    }

    // Descargar adjunto desde Graph API
    private guessMimeTypeFromUrl(url: string): string {
        const clean = (url.split("?")[0] || "").toLowerCase();

        if (clean.endsWith(".png")) return "image/png";
        if (clean.endsWith(".jpg") || clean.endsWith(".jpeg")) return "image/jpeg";
        if (clean.endsWith(".gif")) return "image/gif";
        if (clean.endsWith(".webp")) return "image/webp";
        if (clean.endsWith(".svg")) return "image/svg+xml";

        return "application/octet-stream";
    }

    // Descargar imagen remota con headers adecuados para evitar bloqueos, y convertir a Buffer
    private async downloadRemoteImage(url: string): Promise<Buffer | null> {
        try {
            const response = await fetch(url, {
                headers: {
                    "User-Agent": "Mozilla/5.0",
                    "Accept": "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8",
                },
            });

            if (!response.ok) {
                console.warn(`⚠️ No se pudo descargar imagen remota: ${url} (${response.status})`);
                return null;
            }

            const arrayBuffer = await response.arrayBuffer();
            return Buffer.from(arrayBuffer);
        } catch (err) {
            console.warn(`⚠️ Error descargando imagen remota: ${url}`, err);
            return null;
        }
    }

    // Procesar imágenes remotas en el cuerpo del email: descargarlas, subirlas a Cloudinary y reemplazar URLs
    private async persistRemoteImages(
        ticketId: number,
        messageId: number,
        bodyHtml: string
    ): Promise<string> {
        if (!bodyHtml) return bodyHtml;

        const remoteUrls = this.extractRemoteImages(bodyHtml);
        if (!remoteUrls.length) return bodyHtml;

        let updatedHtml = bodyHtml;

        for (const imageUrl of remoteUrls) {
            // evita volver a procesar imágenes ya alojadas por ustedes
            if (
                imageUrl.includes("res.cloudinary.com") ||
                imageUrl.includes("rids.cl")
            ) {
                continue;
            }

            const buffer = await this.downloadRemoteImage(imageUrl);
            if (!buffer) continue;

            const filename =
                imageUrl.split("/").pop()?.split("?")[0] || `remote-image-${Date.now()}`;

            const mimeType = this.guessMimeTypeFromUrl(imageUrl);

            // Subir a Cloudinary usando stream
            const uploadResult = await new Promise<any>((resolve, reject) => {
                const stream = cloudinary.uploader.upload_stream(
                    {
                        folder: `rids/helpdesk/tickets/${ticketId}`,
                        resource_type: "image",
                        public_id: `remote_${ticketId}_${Date.now()}`,
                    },
                    (error, result) => {
                        if (error) reject(error);
                        else resolve(result);
                    }
                );

                Readable.from(buffer).pipe(stream);
            });

            // Guardar como adjunto para tener registro y evitar pérdida si la imagen original desaparece
            await prisma.ticketAttachment.create({
                data: {
                    messageId,
                    filename,
                    mimeType,
                    bytes: buffer.length,
                    url: uploadResult.secure_url,
                    isInline: true,
                    contentId: null,
                },
            });

            updatedHtml = updatedHtml.replaceAll(imageUrl, uploadResult.secure_url);
        }

        return updatedHtml;
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
        const existingProcessed = await prisma.processedInboundEmail.findUnique({
            where: { sourceMessageId: internetMessageId },
            select: { id: true },
        });

        if (existingProcessed) {
            console.log(`⏭️ Ignorado: email ya procesado en ProcessedInboundEmail (${graphMessageId})`);
            return;
        }

        const existingMsg = await prisma.ticketMessage.findUnique({
            where: { sourceMessageId: internetMessageId },
            select: { id: true },
        });

        if (existingMsg) {
            console.log(`⏭️ Ignorado: email ya procesado en TicketMessage (${graphMessageId})`);
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
                (r.emailAddress.address || "").trim().toLowerCase()
            ).filter(Boolean) || [];

        const ccAddresses =
            message.ccRecipients?.map((r: any) =>
                (r.emailAddress.address || "").trim().toLowerCase()
            ).filter(Boolean) || [];

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
            'mailer-daemon',
            'bounce',
            'postmaster',
        ];

        if (blockedSenders.some(b => fromEmail.includes(b))) {
            console.log(`⏭️ Ignorado: correo automático (${fromEmail})`);
            return;
        }

        /* =============================
           5️⃣ CUERPO
        ============================= */
        const bodyHtml = message.body?.content || "";

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
            messageId: internetMessageId,
            graphMessageId,
            conversationId: message.conversationId || "",
            ...(references && { references }),
            ...(inReplyTo && { inReplyTo }),
            to: toAddresses,
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

        const bodyHasCidImages = /<img[^>]+src=["']cid:/i.test(bodyHtml);
        const bodyHasRemoteImages = /<img[^>]+src=["']https?:\/\//i.test(bodyHtml);

        if (message.hasAttachments || bodyHasCidImages || bodyHasRemoteImages) {
            try {
                emailData.attachmentsMeta = await this.fetchAttachmentsMeta(graphMessageId);
            } catch (err) {
                console.error("⚠️ Error obteniendo adjuntos:", err);
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
            .top(100)
            .get();

        const items = res.value ?? [];

        return items.map((a: any) => {
            const isFileAttachment = a["@odata.type"] === "#microsoft.graph.fileAttachment";

            const contentId = isFileAttachment && a.contentId
                ? String(a.contentId)
                    .replace(/^cid:/i, "")
                    .replace(/^</, "")
                    .replace(/>$/, "")
                : null;

            return {
                graphAttachmentId: a.id,
                filename: a.name || "attachment",
                mimeType: a.contentType || "application/octet-stream",
                bytes: a.size ?? 0,
                isInline: Boolean(a.isInline),
                contentId,
                odataType: a["@odata.type"] || null,
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
                        toEmail: data.to.length ? data.to.join(",") : this.supportEmail,
                        sourceMessageId: data.messageId, // 🔥 unique → protege contra duplicados
                        sourceInReplyTo: data.inReplyTo || null,
                        sourceReferences: data.references || null,
                    },
                });

                return { ticket: t, msg: m };
            });

            ticket = result.ticket;
            msg = result.msg;

            await prisma.processedInboundEmail.create({
                data: {
                    sourceMessageId: data.messageId,
                    graphMessageId: data.graphMessageId,
                    conversationId: data.conversationId || null,
                    fromEmail: data.fromEmail,
                    subject: data.subject,
                    ticketId: ticket.id,
                },
            });

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

        if (data.bodyHtml) {
            const normalizedHtml = await this.persistRemoteImages(
                ticket.id,
                msg.id,
                data.bodyHtml
            );

            if (normalizedHtml !== data.bodyHtml) {
                await prisma.ticketMessage.update({
                    where: { id: msg.id },
                    data: { bodyHtml: normalizedHtml },
                });
            }
        }

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
           8️⃣  AUTO-REPLY (ROBUSTO)
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

            // Obtener técnico + firma
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

            // Si no hay técnico asignado, usar el detectado por empresa o el primero activo
            const tecnicoRender = tecnico
                ? {
                    nombre: tecnico.nombre,
                    email: tecnico.email,
                    cargo: "Soporte Técnico",
                    area: "Asesorías RIDS Ltda.",
                    firmaPath: tecnico.firma?.path ?? null,
                }
                : null;

            // Renderizar plantilla
            const rendered = await ticketEmailTemplateService.render({
                key: "AUTO_REPLY_INBOUND",
                tecnico: tecnicoRender,
                vars: {
                    nombre: data.fromName || "Cliente",
                    ticketId: ticket.id,
                    subject: ticket.subject,
                    bodyOriginal: ticketEmailTemplateService.textToHtml(data.bodyText || ""),
                    messageHtml: ticketEmailTemplateService.textToHtml(data.bodyText || ""),
                    nombreTecnico: tecnico?.nombre || "Equipo de Soporte Técnico",
                    emailTecnico: tecnico?.email || "soporte@rids.cl",
                    cargoTecnico: "Soporte Técnico",
                    areaTecnico: "Asesorías RIDS Ltda.",
                },
            });

            if (rendered.isEnabled) {
                await this.sendReplyEmail({
                    to: data.fromEmail,
                    subject: rendered.subject,
                    bodyHtml: rendered.bodyHtml,
                });

                await prisma.ticketMessage.create({
                    data: {
                        ticketId: ticket.id,
                        direction: MessageDirection.OUTBOUND,
                        bodyText: "Correo automático de confirmación enviado",
                        bodyHtml: rendered.bodyHtml,
                        isInternal: false,
                        fromEmail: this.supportEmail,
                        toEmail: data.fromEmail,
                        sourceMessageId: `<auto-reply-${ticket.id}-${Date.now()}@rids.cl>`,
                        sourceInReplyTo: data.messageId,
                    },
                });
            }

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

        // Normalizar y comparar sujetos de los tickets recientes
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

        // Validar que el ticket aún existe y no está cerrado antes de agregar el mensaje
        const ticketBase = await prisma.ticket.findUnique({
            where: { id: ticketId },
            select: {
                empresaId: true,
                requesterId: true,
            },
        });

        // Si el ticket ya tiene requester asignado, lo respetamos. Sino, intentamos asignar por email.
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
            // DEDUPE primero para que no duplique nada
            const existsProcessed = await tx.processedInboundEmail.findUnique({
                where: { sourceMessageId: data.messageId },
                select: { id: true },
            });
            if (existsProcessed) return null;

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
                    toEmail: data.to.length ? data.to.join(",") : this.supportEmail,
                    cc: data.cc.length ? data.cc.join(",") : null,
                    sourceMessageId: data.messageId,
                    sourceInReplyTo: data.inReplyTo || null,
                    sourceReferences: data.references || null,
                },
            });

            await tx.processedInboundEmail.create({
                data: {
                    sourceMessageId: data.messageId,
                    graphMessageId: data.graphMessageId,
                    conversationId: data.conversationId || null,
                    fromEmail: data.fromEmail,
                    subject: data.subject,
                    ticketId,
                },
            });

            // Actualizar ticket (última actividad, posible requester, etc.)
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

            // Verificar estado actual del ticket dentro de la transacción para evitar condiciones de carrera
            const ticketActual = await tx.ticket.findUnique({
                where: { id: ticketId },
                select: { status: true }
            });

            // Si el ticket estaba cerrado, lo reabrimos automáticamente al recibir una respuesta del cliente
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

            if (data.bodyHtml) {
                const normalizedHtml = await this.persistRemoteImages(
                    ticketId,
                    msg.id,
                    data.bodyHtml
                );

                if (normalizedHtml !== data.bodyHtml) {
                    await prisma.ticketMessage.update({
                        where: { id: msg.id },
                        data: { bodyHtml: normalizedHtml },
                    });
                }
            }
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

        // Si el ticket estaba cerrado, el evento de re-apertura ya se emitió en la transacción. No es necesario emitirlo de nuevo aquí.
        bus.emit("ticket.customer_replied", {
            ticketId,
            subject: data.subject,
            fromEmail: data.fromEmail,
            fromName: data.fromName,
            direction: "INBOUND",
            lastActivityAt: new Date(),
        });

        // Emitir evento general de actualización para que se refresque el ticket en el frontend, etc.
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
            .api(`/users/${this.supportEmail}/messages/${graphMessageId}/attachments/${attachmentId}`)
            .get();

        if (
            res["@odata.type"] === "#microsoft.graph.fileAttachment" &&
            res.contentBytes
        ) {
            return Buffer.from(res.contentBytes, "base64");
        }

        try {
            const raw = await client
                .api(`/users/${this.supportEmail}/messages/${graphMessageId}/attachments/${attachmentId}/$value`)
                .get();

            if (Buffer.isBuffer(raw)) return raw;
            if (raw instanceof ArrayBuffer) return Buffer.from(raw);
            if (raw?.arrayBuffer) return Buffer.from(await raw.arrayBuffer());
        } catch (err) {
            console.warn(`⚠️ No se pudo descargar attachment ${attachmentId} por $value`);
        }

        return null;
    }

    // Método para enviar email de respuesta (usado en respuestas desde el frontend, etc.)
    async sendReplyEmail(params: {
        to: string | string[];
        cc?: string[];
        subject: string;
        bodyHtml: string;
        attachments?: Array<{
            name: string;
            contentType: string;
            contentBytes: string;
        }>;
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
                    attachments: (params.attachments ?? []).map(att => ({
                        "@odata.type": "#microsoft.graph.fileAttachment",
                        name: att.name,
                        contentType: att.contentType,
                        contentBytes: att.contentBytes,
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

    // Crear evento en el calendario del soporte
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

    // Actualizar evento (solo campos específicos)
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
