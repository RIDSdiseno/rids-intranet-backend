// src/services/reportes/reporte-email.service.ts
import { transporter } from "../../../../lib/mailer.js";
function escapeHtml(text) {
    // Evita que texto ingresado por usuario rompa el HTML del correo.
    return text
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}
function buildInformeResumenEmailHtml(params) {
    const mensajeSeguro = escapeHtml(params.mensaje?.trim() ||
        "Se adjunta el informe resumido generado desde el sistema.").replace(/\n/g, "<br>");
    const empresa = params.empresa?.trim() || "Empresa no especificada";
    const periodo = params.periodo?.trim() || "Período no especificado";
    return `
        <div style="font-family: Arial, sans-serif; color: #111827; line-height: 1.6; background: #f8fafc; padding: 24px;">
            <div style="max-width: 680px; margin: 0 auto; background: #ffffff; border: 1px solid #e5e7eb; border-radius: 14px; overflow: hidden;">
                
                <div style="padding: 20px 24px; border-bottom: 1px solid #e5e7eb;">
                    <h2 style="margin: 0; color: #0f172a; font-size: 20px;">
                        Informe resumido RIDS
                    </h2>
                    <p style="margin: 6px 0 0; color: #64748b; font-size: 14px;">
                        Reporte ejecutivo adjunto en formato PDF.
                    </p>
                </div>

                <div style="padding: 20px 24px;">
                    <p style="margin-top: 0;">
                        ${mensajeSeguro}
                    </p>

                    <div style="margin: 18px 0; padding: 14px 16px; border: 1px solid #e2e8f0; border-radius: 12px; background: #f8fafc;">
                        <p style="margin: 0 0 8px;">
                            <strong>Empresa:</strong> ${escapeHtml(empresa)}
                        </p>
                        <p style="margin: 0 0 8px;">
                            <strong>Período:</strong> ${escapeHtml(periodo)}
                        </p>
                        <p style="margin: 0;">
                            <strong>Archivo:</strong> ${escapeHtml(params.fileName)}
                        </p>
                    </div>

                    <p style="margin-bottom: 0; color: #64748b; font-size: 13px;">
                        Este correo fue enviado automáticamente desde el módulo de reportes.
                    </p>
                </div>
            </div>
        </div>
    `;
}
export async function enviarInformeResumenPorCorreo(params) {
    const to = params.to.trim().toLowerCase();
    if (!to) {
        throw new Error("Debes ingresar un correo destinatario.");
    }
    if (!params.subject?.trim()) {
        throw new Error("Debes ingresar un asunto.");
    }
    if (!params.fileName || !params.mimeType || !params.fileBase64) {
        throw new Error("No se recibió el archivo del informe.");
    }
    // Validación simple de tamaño para evitar adjuntos demasiado grandes.
    const sizeMb = Buffer.byteLength(params.fileBase64, "base64") / (1024 * 1024);
    if (sizeMb > 20) {
        throw new Error("El informe es demasiado grande para enviarlo por correo.");
    }
    const fileBuffer = Buffer.from(params.fileBase64, "base64");
    await transporter.sendMail({
        from: `"RIDS Reportes" <${process.env.MAIL_USER}>`,
        to,
        subject: params.subject.trim(),
        html: buildInformeResumenEmailHtml(params),
        attachments: [
            {
                filename: params.fileName,
                content: fileBuffer,
                contentType: params.mimeType,
            },
        ],
    });
}
//# sourceMappingURL=reportes-email.service.js.map