// src/services/email/email-sender.service.ts
import nodemailer from 'nodemailer';
class EmailSenderService {
    transporter;
    constructor() {
        this.transporter = nodemailer.createTransport({
            host: process.env.SMTP_HOST || 'smtp.office365.com',
            port: Number(process.env.SMTP_PORT || 587),
            secure: false, // true solo para 465
            auth: {
                user: process.env.SMTP_USER,
                pass: process.env.SMTP_PASSWORD,
            },
        });
    }
    /**
     * Envía respuesta del agente al cliente
     */
    async sendAgentReply(ticket, message, toEmail) {
        try {
            await this.transporter.sendMail({
                from: `"Soporte RIDS" <${process.env.SMTP_USER}>`,
                to: toEmail,
                subject: `Re: Ticket #${ticket.id} - ${ticket.subject}`,
                html: this.buildReplyTemplate(ticket, message),
                headers: {
                    'In-Reply-To': `<ticket-${ticket.id}@rids.cl>`,
                    References: `<ticket-${ticket.id}@rids.cl>`,
                },
            });
            console.log(`✅ Email enviado a ${toEmail} (Ticket #${ticket.id})`);
        }
        catch (error) {
            console.error('❌ Error enviando email:', error);
            throw error;
        }
    }
    /**
     * Template HTML para respuesta
     */
    buildReplyTemplate(ticket, message) {
        return `
        <!DOCTYPE html>
        <html>
        <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
            <div style="max-width: 600px; margin: 0 auto; padding: 20px;">
                <div style="white-space: pre-wrap;">
                    ${this.escapeHtml(message)}
                </div>

                <hr style="margin: 30px 0; border: none; border-top: 1px solid #ddd;">

                <div style="color: #666; font-size: 12px;">
                    <p>
                        <strong>Ticket #${ticket.id}</strong> |
                        Estado: ${this.translateStatus(ticket.status)}
                    </p>
                    <p>Para responder, simplemente responde a este email.</p>
                    <p style="color: #999;">
                        Este mensaje fue enviado por el sistema de tickets RIDS.
                    </p>
                </div>
            </div>
        </body>
        </html>
        `;
    }
    escapeHtml(text) {
        return text
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;')
            .replace(/\n/g, '<br>');
    }
    translateStatus(status) {
        const translations = {
            NEW: 'Nuevo',
            OPEN: 'Abierto',
            PENDING: 'Pendiente',
            RESOLVED: 'Resuelto',
            CLOSED: 'Cerrado',
        };
        return translations[status] ?? status;
    }
}
export const emailSenderService = new EmailSenderService();
//# sourceMappingURL=email-sender.service.js.map