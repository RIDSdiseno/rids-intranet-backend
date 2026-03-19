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
    async sendAgentReply(ticket, message, to, cc, files) {
        try {
            // 🆕 Construir adjuntos si existen
            const attachments = files?.map(file => ({
                filename: file.originalname,
                path: file.path, // Cloudinary secure_url
            })) || [];
            await this.transporter.sendMail({
                from: `"Soporte RIDS" <${process.env.SMTP_USER}>`,
                to: to.join(","),
                cc: cc?.length ? cc.join(",") : undefined,
                subject: `Re: Ticket #${ticket.id} - ${ticket.subject}`,
                html: this.buildReplyTemplate(ticket, message),
                attachments, // 👈 AQUÍ SE AGREGAN
                headers: {
                    'In-Reply-To': `<ticket-${ticket.id}@rids.cl>`,
                    References: `<ticket-${ticket.id}@rids.cl>`,
                },
            });
            console.log(`✅ Email enviado a ${to.join(",")} (Ticket #${ticket.id})`);
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
        const formattedMessage = this.escapeHtml(message).replace(/\n/g, "<br>");
        return `
    <!DOCTYPE html>
    <html>
    <body style="margin:0; padding:0; background:#f5f5f5; font-family: Arial, sans-serif;">
        
        <table width="100%" cellpadding="0" cellspacing="0" style="background:#f5f5f5; padding:20px 0;">
            <tr>
                <td align="center">
                    
                    <table width="600" cellpadding="20" cellspacing="0" style="background:#ffffff;">
                        
                        <!-- HEADER -->
                        <tr>
                            <td style="border-bottom:1px solid #ddd;">
                                <strong style="color:#0ea5e9;">Soporte RIDS</strong>
                            </td>
                        </tr>

                        <!-- BODY -->
                        <tr>
                            <td style="font-size:14px; color:#333; line-height:1.6;">
                                ${formattedMessage}
                            </td>
                        </tr>

                        <!-- FOOTER -->
                        <tr>
                            <td style="border-top:1px solid #ddd; font-size:12px; color:#666;">
                                <p>
                                    <strong>Ticket #${ticket.id}</strong><br/>
                                    Estado: ${this.translateStatus(ticket.status)}
                                </p>
                                <p>Para responder, simplemente responde a este correo.</p>
                            </td>
                        </tr>

                    </table>

                </td>
            </tr>
        </table>

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
            CLOSED: 'Cerrado',
        };
        return translations[status] ?? status;
    }
}
export const emailSenderService = new EmailSenderService();
//# sourceMappingURL=email-sender.service.js.map