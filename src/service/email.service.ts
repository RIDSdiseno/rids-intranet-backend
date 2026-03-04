import nodemailer from "nodemailer";

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || "smtp.gmail.com",
  port: Number(process.env.SMTP_PORT) || 587,
  secure: false, 
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

export async function sendTicketCreatedEmail(to: string, ticketId: string, summary: string) {
  try {
    const mailOptions = {
      from: `"Soporte RIDS" <${process.env.SMTP_USER}>`,
      to,
      subject: `Ticket Recibido #${ticketId}`,
      html: `
        <div style="font-family: sans-serif; max-width: 600px; margin: auto; border: 1px solid #eee; padding: 20px;">
          <h2 style="color: #2d3748;">¡Hola! Hemos recibido tu solicitud</h2>
          <div style="background-color: #f7fafc; padding: 15px; border-radius: 8px; margin: 20px 0;">
            <p><strong>ID del Ticket:</strong> #${ticketId}</p>
            <p><strong>Resumen de tu solicitud (IA):</strong></p>
            <p style="font-style: italic;">"${summary}"</p>
          </div>
          <p style="color: #718096; font-size: 0.9em;">Nuestro equipo técnico revisará tu caso a la brevedad.</p>
        </div>
      `,
    };

    await transporter.sendMail(mailOptions);
    console.log("✅ Correo enviado satisfactoriamente");
  } catch (error) {
    console.error("❌ Error al enviar el correo:", error);
  }
}