// src/service/email.service.ts
import nodemailer from "nodemailer";

export async function sendTicketCreatedEmail(to: string, ticketId: string, context: string) {
  // Configuración del transporte (asegúrate de tener estas variables en tu .env)
  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT) || 587,
    secure: process.env.SMTP_SECURE === "true", // true para puerto 465, false para otros
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });

  const html = `
    <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; max-width: 600px; margin: 0 auto; color: #333;">
      <div style="background-color: #0056b3; color: white; padding: 20px; text-align: center; border-radius: 5px 5px 0 0;">
        <h2 style="margin: 0;">Ticket #${ticketId} Creado</h2>
      </div>
      <div style="padding: 20px; border: 1px solid #ddd; border-top: none; border-radius: 0 0 5px 5px;">
        <p>Hola,</p>
        <p>Hemos recibido tu solicitud de soporte correctamente. Nuestro equipo ya ha sido notificado.</p>
        
        <div style="background-color: #f8f9fa; border-left: 4px solid #0056b3; padding: 15px; margin: 20px 0;">
          <strong style="display: block; margin-bottom: 5px; color: #0056b3;">Resumen de tu solicitud:</strong>
          <p style="margin: 0; font-style: italic;">"${context}"</p>
        </div>

        <p>Un técnico revisará tu caso a la brevedad y te contactará si requiere más información.</p>
        
        <hr style="border: 0; border-top: 1px solid #eee; margin: 20px 0;">
        <p style="font-size: 12px; color: #888; text-align: center;">
          Este es un mensaje automático, por favor no responder directamente a este correo si no es necesario.
        </p>
      </div>
    </div>
  `;

  try {
    await transporter.sendMail({
      from: process.env.SMTP_FROM || '"Soporte" <soporte@tuempresa.com>',
      to,
      subject: `[Ticket #${ticketId}] Solicitud Recibida`,
      html,
    });
    console.log(`📧 Correo enviado a ${to} para ticket ${ticketId}`);
  } catch (error) {
    console.error("❌ Error enviando correo:", error);
  }
}
