// src/services/email/imap-reader.service.ts
import imaps from 'imap-simple';
import { simpleParser } from 'mailparser';
import type { ParsedMail } from 'mailparser';
import { prisma } from '../../lib/prisma.js';
import crypto from 'crypto';
import {
    TicketStatus,
    TicketPriority,
    TicketEventType,
    TicketActorType,
    MessageDirection,
    TicketChannel
} from '@prisma/client';

import type { AddressObject } from "mailparser";

interface ParsedEmail {
    fromEmail: string;
    fromName: string;
    subject: string;
    bodyText: string;
    bodyHtml: string;
    messageId: string;
    inReplyTo: string;
    cc: string[];
    attachments: any[];
}

class ImapReaderService {
    private config = {
        imap: {
            user: process.env.EMAIL_USER!,
            password: process.env.EMAIL_PASSWORD!,
            host: process.env.EMAIL_HOST || 'outlook.office365.com',
            port: parseInt(process.env.EMAIL_PORT || '993'),
            tls: true,
            authTimeout: 30000,
            tlsOptions: {
                rejectUnauthorized: false
            }
        }
    };

    constructor() {
        console.log('📧 Email Config:');
        console.log(`   User: ${this.config.imap.user}`);
        console.log(`   Host: ${this.config.imap.host}`);
        console.log(`   Port: ${this.config.imap.port}`);

        if (!this.config.imap.user || !this.config.imap.password) {
            console.warn('⚠️ Email no configurado');
        }
    }

    async readUnreadEmails(): Promise<void> {
        if (!this.config.imap.user || !this.config.imap.password) {
            throw new Error('Configuración de email incompleta');
        }

        let connection;

        try {
            console.log(`🔐 Conectando a ${this.config.imap.host}...`);

            connection = await imaps.connect(this.config);
            console.log('✅ Conexión IMAP exitosa');

            await connection.openBox('INBOX');
            console.log('📬 Buzón INBOX abierto');

            // Buscar emails no leídos
            const searchCriteria = ['UNSEEN'];
            const fetchOptions = {
                bodies: [''],
                markSeen: true
            };

            const messages = await connection.search(searchCriteria, fetchOptions);

            if (messages.length === 0) {
                console.log('📭 No hay emails sin leer');
                return;
            }

            console.log(`📧 Encontrados ${messages.length} emails sin leer`);

            for (const item of messages) {
                try {
                    const all = item.parts.find((part: any) => part.which === '');
                    if (!all || !all.body) continue;

                    const parsed = await simpleParser(all.body);
                    await this.processEmail(parsed);
                } catch (error) {
                    console.error('❌ Error procesando email:', error);
                }
            }

            console.log('✅ Todos los emails procesados');

        } catch (error: any) {
            console.error('❌ Error en IMAP:', error.message);
            throw error;
        } finally {
            if (connection) {
                connection.end();
                console.log('📪 Conexión cerrada');
            }
        }
    }

    private async processEmail(parsed: ParsedMail): Promise<void> {
        const cc: string[] = [];

        const parsedCc = parsed.cc;

        if (parsedCc) {
            const list = Array.isArray(parsedCc) ? parsedCc : [parsedCc];

            list.forEach((addr: AddressObject) => {
                addr.value?.forEach(v => {
                    if (v.address) {
                        cc.push(v.address.toLowerCase());
                    }
                });
            });
        }
        const emailData: ParsedEmail = {
            fromEmail: parsed.from?.value[0]?.address?.toLowerCase() || '',
            fromName: parsed.from?.value[0]?.name || parsed.from?.value[0]?.address?.split('@')[0] || 'Desconocido',
            subject: parsed.subject || 'Sin asunto',
            bodyText: parsed.text || '',
            bodyHtml: parsed.html || '',
            messageId: parsed.messageId || '',
            // 🔧 FIX: inReplyTo puede ser string o string[] o undefined
            inReplyTo: Array.isArray(parsed.inReplyTo) ? parsed.inReplyTo[0] || '' : parsed.inReplyTo || '',
            attachments: parsed.attachments || [],
            cc,
        };

        console.log(`📨 Procesando: ${emailData.fromEmail} - ${emailData.subject}`);

        try {
            await this.createOrUpdateTicket(emailData);
        } catch (error) {
            console.error('❌ Error creando ticket:', error);
            throw error;
        }
    }

    private async createOrUpdateTicket(data: ParsedEmail): Promise<void> {
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
                throw new Error('No existe empresa "SIN CLASIFICAR"');
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
                console.log(`👤 Solicitante creado: ${data.fromName}`);
            }

            const priority = this.detectPriority(data.subject, data.bodyText);
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
                    inboxEmail: this.config.imap.user,
                    lastActivityAt: new Date(),
                },
            });

            await prisma.ticketMessage.create({
                data: {
                    ticketId: ticket.id,
                    direction: MessageDirection.INBOUND,
                    bodyText: data.bodyText,
                    bodyHtml: data.bodyHtml,
                    isInternal: false,
                    fromEmail: data.fromEmail,
                    toEmail: this.config.imap.user,
                    cc: data.cc.length ? data.cc.join(",") : null,
                    sourceMessageId: data.messageId,
                    sourceInReplyTo: data.inReplyTo || null,
                },
            });

            await prisma.ticketEvent.create({
                data: {
                    ticketId: ticket.id,
                    type: TicketEventType.CREATED,
                    actorType: TicketActorType.REQUESTER,
                },
            });

            console.log(`✅ Ticket #${ticket.id} creado (${empresa.nombre})`);

        } catch (error) {
            console.error('❌ Error:', error);
            throw error;
        }
    }

    private async findExistingTicket(data: ParsedEmail): Promise<any> {
        // 1. Buscar por inReplyTo (email threading)
        if (data.inReplyTo) {
            const ticket = await prisma.ticket.findFirst({
                where: {
                    messages: { some: { sourceMessageId: data.inReplyTo } },
                    status: { not: TicketStatus.CLOSED },
                },
            });
            if (ticket) return ticket;
        }

        // 2. Buscar por #ID en el subject
        const match = data.subject.match(/#(\d+)/);
        if (match && match[1]) {
            const ticketId = Number(match[1]);

            if (!Number.isNaN(ticketId)) {
                const ticket = await prisma.ticket.findFirst({
                    where: {
                        id: ticketId,
                        fromEmail: data.fromEmail,
                        status: { not: TicketStatus.CLOSED },
                    },
                });

                if (ticket) return ticket;
            }
        }

        return null;
    }

    private async addMessageToTicket(ticketId: number, data: ParsedEmail): Promise<void> {
        await prisma.$transaction(async (tx) => {
            await tx.ticketMessage.create({
                data: {
                    ticketId,
                    direction: MessageDirection.INBOUND,
                    bodyText: data.bodyText,
                    bodyHtml: data.bodyHtml,
                    isInternal: false,
                    fromEmail: data.fromEmail,
                    toEmail: this.config.imap.user,
                    sourceMessageId: data.messageId,
                    sourceInReplyTo: data.inReplyTo || null,
                    cc: data.cc.length ? data.cc.join(",") : null,
                },
            });

            const ticket = await tx.ticket.findUnique({ where: { id: ticketId } });
            const updateData: any = { lastActivityAt: new Date() };

            if (ticket?.status === TicketStatus.CLOSED || ticket?.status === TicketStatus.RESOLVED) {
                updateData.status = TicketStatus.OPEN;
            }

            await tx.ticket.update({ where: { id: ticketId }, data: updateData });

            await tx.ticketEvent.create({
                data: {
                    ticketId,
                    type: TicketEventType.MESSAGE_SENT,
                    actorType: TicketActorType.REQUESTER,
                },
            });
        });
    }

    private detectPriority(subject: string, body: string): TicketPriority {
        const text = `${subject} ${body}`.toLowerCase();
        const urgentKeywords = ['urgente', 'emergencia', 'crítico', 'caído', 'bloqueante'];
        const highKeywords = ['importante', 'asap', 'prioridad', 'cuanto antes'];

        if (urgentKeywords.some(k => text.includes(k))) return TicketPriority.URGENT;
        if (highKeywords.some(k => text.includes(k))) return TicketPriority.HIGH;
        return TicketPriority.NORMAL;
    }
}

export const imapReaderService = new ImapReaderService();