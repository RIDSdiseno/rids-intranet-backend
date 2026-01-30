// src/services/email/imap-reader.service.ts
import Imap from 'imap';
import { simpleParser } from 'mailparser';
import { prisma } from '../../lib/prisma.js';
import crypto from 'crypto';
import { TicketStatus, TicketPriority, TicketEventType, TicketActorType, MessageDirection, TicketChannel } from '@prisma/client';
class ImapReaderService {
    config;
    imap = null;
    constructor() {
        this.config = {
            user: process.env.EMAIL_USER,
            password: process.env.EMAIL_PASSWORD,
            host: process.env.EMAIL_HOST || 'outlook.office365.com',
            port: parseInt(process.env.EMAIL_PORT || '993'),
            tls: process.env.EMAIL_TLS !== 'false',
        };
        // Validar configuración
        if (!this.config.user || !this.config.password) {
            console.warn('⚠️ Email no configurado. Revisa EMAIL_USER y EMAIL_PASSWORD en .env');
        }
    }
    /**
     * Lee emails no leídos del buzón
     */
    async readUnreadEmails() {
        if (!this.config.user || !this.config.password) {
            throw new Error('Configuración de email incompleta');
        }
        return new Promise((resolve, reject) => {
            this.imap = new Imap({
                user: this.config.user,
                password: this.config.password,
                host: this.config.host,
                port: this.config.port,
                tls: this.config.tls,
                tlsOptions: { rejectUnauthorized: false },
            });
            this.imap.once('ready', () => {
                this.openInbox((err) => {
                    if (err) {
                        reject(err);
                        return;
                    }
                    this.fetchUnreadMessages()
                        .then(() => {
                        this.imap?.end();
                        resolve();
                    })
                        .catch((error) => {
                        this.imap?.end();
                        reject(error);
                    });
                });
            });
            this.imap.once('error', (err) => {
                console.error('❌ Error IMAP:', err);
                reject(err);
            });
            this.imap.once('end', () => {
                console.log('📪 Conexión IMAP cerrada');
            });
            this.imap.connect();
        });
    }
    openInbox(callback) {
        this.imap?.openBox('INBOX', false, callback);
    }
    async fetchUnreadMessages() {
        return new Promise((resolve, reject) => {
            if (!this.imap) {
                reject(new Error('IMAP no inicializado'));
                return;
            }
            this.imap.search(['UNSEEN'], async (err, results) => {
                if (err) {
                    reject(err);
                    return;
                }
                if (!results || results.length === 0) {
                    console.log('📭 No hay emails sin leer');
                    resolve();
                    return;
                }
                console.log(`📧 Encontrados ${results.length} emails sin leer`);
                const fetch = this.imap.fetch(results, {
                    bodies: '',
                    markSeen: true, // Marcar como leído
                });
                const promises = [];
                fetch.on('message', (msg, seqno) => {
                    promises.push(this.processMessage(msg, seqno));
                });
                fetch.once('error', (err) => {
                    console.error('❌ Error en fetch:', err);
                    reject(err);
                });
                fetch.once('end', async () => {
                    try {
                        await Promise.all(promises);
                        console.log('✅ Todos los emails procesados');
                        resolve();
                    }
                    catch (error) {
                        reject(error);
                    }
                });
            });
        });
    }
    async processMessage(msg, seqno) {
        return new Promise((resolve, reject) => {
            msg.on('body', async (stream) => {
                try {
                    const parsed = await simpleParser(stream);
                    const emailData = {
                        fromEmail: parsed.from?.value[0]?.address?.toLowerCase() || '',
                        fromName: parsed.from?.value[0]?.name || parsed.from?.value[0]?.address?.split('@')[0] || 'Desconocido',
                        subject: parsed.subject || 'Sin asunto',
                        bodyText: parsed.text || '',
                        bodyHtml: parsed.html || '',
                        messageId: parsed.messageId || '',
                        inReplyTo: parsed.inReplyTo || '',
                        attachments: parsed.attachments || [],
                    };
                    console.log(`📨 Email #${seqno}: ${emailData.fromEmail} - ${emailData.subject}`);
                    await this.createOrUpdateTicket(emailData);
                    resolve();
                }
                catch (error) {
                    console.error(`❌ Error procesando email #${seqno}:`, error);
                    reject(error);
                }
            });
        });
    }
    /**
     * Crea ticket nuevo o agrega mensaje a uno existente
     */
    async createOrUpdateTicket(data) {
        try {
            // 1️⃣ Buscar ticket existente
            const existingTicket = await this.findExistingTicket(data);
            if (existingTicket) {
                await this.addMessageToTicket(existingTicket.id, data);
                console.log(`✅ Mensaje agregado al ticket #${existingTicket.id}`);
                return;
            }
            // 2️⃣ Crear nuevo ticket
            const domain = data.fromEmail.split('@')[1];
            if (!domain) {
                console.warn(`⚠️ Email sin dominio válido: ${data.fromEmail}`);
                return;
            }
            // Buscar empresa por dominio
            let empresa = await prisma.empresa.findFirst({
                where: {
                    dominios: {
                        has: domain,
                    },
                },
            });
            if (!empresa) {
                empresa = await prisma.empresa.findFirst({
                    where: { nombre: 'SIN CLASIFICAR' },
                });
                console.log(`⚠️ Dominio ${domain} no reconocido → SIN CLASIFICAR`);
            }
            if (!empresa) {
                throw new Error('No existe empresa "SIN CLASIFICAR" en la base de datos');
            }
            await prisma.empresa.findFirst({
                where: {
                    dominios: {
                        has: domain,
                    },
                },
            });
            if (domain) {
                empresa = await prisma.empresa.findFirst({
                    where: {
                        dominios: {
                            has: domain,
                        },
                    },
                });
            }
            // Fallback a "SIN CLASIFICAR"
            if (!empresa) {
                empresa = await prisma.empresa.findFirst({
                    where: { nombre: 'SIN CLASIFICAR' },
                });
                console.log(`⚠️ Dominio ${domain} no reconocido → SIN CLASIFICAR`);
            }
            if (!empresa) {
                throw new Error('No existe empresa "SIN CLASIFICAR" en la base de datos');
            }
            // Buscar o crear solicitante
            let requester = await prisma.solicitante.findFirst({
                where: { email: data.fromEmail },
            });
            if (!requester) {
                requester = await prisma.solicitante.create({
                    data: {
                        nombre: data.fromName,
                        email: data.fromEmail,
                        empresaId: empresa.id_empresa,
                    },
                });
                console.log(`👤 Solicitante creado: ${data.fromName} (${data.fromEmail})`);
            }
            // Detectar prioridad automáticamente
            const priority = this.detectPriority(data.subject, data.bodyText);
            // Crear ticket
            const publicId = crypto.randomUUID();
            const ticket = await prisma.ticket.create({
                data: {
                    publicId,
                    subject: data.subject,
                    status: TicketStatus.NEW,
                    priority,
                    channel: TicketChannel.EMAIL,
                    empresaId: empresa.id_empresa,
                    requesterId: requester.id_solicitante,
                    fromEmail: data.fromEmail,
                    inboxEmail: this.config.user,
                    lastActivityAt: new Date(),
                },
            });
            // Crear mensaje inicial
            await prisma.ticketMessage.create({
                data: {
                    ticketId: ticket.id,
                    direction: MessageDirection.INBOUND,
                    bodyText: data.bodyText,
                    bodyHtml: data.bodyHtml,
                    isInternal: false,
                    fromEmail: data.fromEmail,
                    toEmail: this.config.user,
                    sourceMessageId: data.messageId,
                    sourceInReplyTo: data.inReplyTo,
                },
            });
            // Crear evento
            await prisma.ticketEvent.create({
                data: {
                    ticketId: ticket.id,
                    type: TicketEventType.CREATED,
                    actorType: TicketActorType.REQUESTER,
                },
            });
            console.log(`✅ Ticket #${ticket.id} creado desde email (${empresa.nombre})`);
            // TODO: Procesar adjuntos si los hay
            if (data.attachments.length > 0) {
                console.log(`📎 ${data.attachments.length} adjuntos detectados (pendiente implementar)`);
            }
        }
        catch (error) {
            console.error('❌ Error creando/actualizando ticket:', error);
            throw error;
        }
    }
    /**
     * Busca un ticket existente relacionado con el email
     */
    async findExistingTicket(data) {
        // 1. Buscar por messageId en reply (más confiable)
        if (data.inReplyTo) {
            const ticket = await prisma.ticket.findFirst({
                where: {
                    messages: {
                        some: { sourceMessageId: data.inReplyTo },
                    },
                    status: { not: TicketStatus.CLOSED },
                },
            });
            if (ticket)
                return ticket;
        }
        // 2. Buscar por subject con #ID del ticket
        const match = data.subject.match(/#(\d+)/);
        if (match && match[1]) {
            const ticketId = Number(match[1]);
            const ticket = await prisma.ticket.findFirst({
                where: {
                    id: ticketId,
                    fromEmail: data.fromEmail,
                    status: { not: TicketStatus.CLOSED },
                },
            });
            if (ticket)
                return ticket;
        }
        // 3. Buscar por asunto similar reciente (últimos 7 días)
        const cleanSubject = data.subject.replace(/^(RE:|FW:)\s*/i, '').trim();
        if (cleanSubject.length > 3) {
            const ticket = await prisma.ticket.findFirst({
                where: {
                    subject: {
                        contains: cleanSubject,
                        mode: 'insensitive',
                    },
                    fromEmail: data.fromEmail,
                    createdAt: {
                        gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
                    },
                    status: { not: TicketStatus.CLOSED },
                },
                orderBy: { createdAt: 'desc' },
            });
            if (ticket)
                return ticket;
        }
        return null;
    }
    /**
     * Agrega mensaje a un ticket existente
     */
    async addMessageToTicket(ticketId, data) {
        await prisma.$transaction(async (tx) => {
            // Crear mensaje
            await tx.ticketMessage.create({
                data: {
                    ticketId,
                    direction: MessageDirection.INBOUND,
                    bodyText: data.bodyText,
                    bodyHtml: data.bodyHtml,
                    isInternal: false,
                    fromEmail: data.fromEmail,
                    toEmail: this.config.user,
                    sourceMessageId: data.messageId,
                    sourceInReplyTo: data.inReplyTo,
                },
            });
            // Actualizar ticket (reabrir si estaba cerrado)
            const ticket = await tx.ticket.findUnique({
                where: { id: ticketId },
            });
            const updateData = {
                lastActivityAt: new Date(),
            };
            if (ticket?.status === TicketStatus.CLOSED || ticket?.status === TicketStatus.RESOLVED) {
                updateData.status = TicketStatus.OPEN;
            }
            await tx.ticket.update({
                where: { id: ticketId },
                data: updateData,
            });
            // Crear evento
            await tx.ticketEvent.create({
                data: {
                    ticketId,
                    type: TicketEventType.MESSAGE_SENT,
                    actorType: TicketActorType.REQUESTER,
                },
            });
        });
    }
    /**
     * Detecta prioridad automáticamente por palabras clave
     */
    detectPriority(subject, body) {
        const text = `${subject} ${body}`.toLowerCase();
        const urgentKeywords = [
            'urgente', 'emergencia', 'crítico', 'bloqueante',
            'caído', 'down', 'critical', 'inmediato'
        ];
        const highKeywords = [
            'importante', 'prioridad alta', 'asap',
            'lo antes posible', 'high priority', 'cuanto antes'
        ];
        if (urgentKeywords.some(k => text.includes(k))) {
            return TicketPriority.URGENT;
        }
        if (highKeywords.some(k => text.includes(k))) {
            return TicketPriority.HIGH;
        }
        return TicketPriority.NORMAL;
    }
}
export const imapReaderService = new ImapReaderService();
//# sourceMappingURL=imap-reader.service.js.map