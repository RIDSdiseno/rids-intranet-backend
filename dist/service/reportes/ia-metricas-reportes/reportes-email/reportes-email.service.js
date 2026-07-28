// src/services/reportes/reporte-email.service.ts
import { transporter } from "../../../../lib/mailer.js";
function normalizeEmailList(value) {
    /*
      Permite recibir correos como:
      - string separado por coma
      - string separado por punto y coma
      - string separado por saltos de línea
      - array de strings
    */
    const rawItems = Array.isArray(value)
        ? value
        : String(value ?? "")
            .split(/[,;\n\r]+/g);
    return rawItems
        .map((email) => String(email).trim().toLowerCase())
        .filter(Boolean);
}
function validateEmailList(emails, fieldName) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    const invalidos = emails.filter((email) => !emailRegex.test(email));
    if (invalidos.length > 0) {
        throw new Error(`Correos inválidos en ${fieldName}: ${invalidos.join(", ")}`);
    }
}
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
        "Se adjunta el informe generado desde el sistema.").replace(/\n/g, "<br>");
    const empresa = params.empresa?.trim() || "Empresa no especificada";
    const periodo = params.periodo?.trim() || "Período no especificado";
    const esDocx = params.mimeType ===
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
    const titulo = esDocx ? "Informe mensual Soporte TI RIDS" : "Informe resumido RIDS";
    const descripcion = esDocx
        ? "Reporte ejecutivo generado desde el sistema interno de RIDS"
        : "Reporte ejecutivo generado desde el sistema.";
    const tipoArchivo = esDocx ? "Documento Word (.docx)" : "Documento PDF";
    return `
        <div style="margin:0; padding:0; background:#f1f5f9; font-family:Arial, Helvetica, sans-serif; color:#0f172a;">
            <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f1f5f9; padding:24px 12px;">
                <tr>
                    <td align="center">
                        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:720px; background:#ffffff; border-radius:18px; overflow:hidden; border:1px solid #e2e8f0;">
                            
                            <!-- Header -->
                            <tr>
                                <td style="background:#0f2b67; padding:28px 32px;">
                                    <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                                        <tr>
                                            <td>
                                                <div style="font-size:12px; letter-spacing:0.08em; text-transform:uppercase; color:#bfdbfe; font-weight:bold;">
                                                    Asesorías RIDS · Reportes
                                                </div>

                                                <h1 style="margin:10px 0 0; font-size:24px; line-height:1.25; color:#ffffff; font-weight:700;">
                                                    ${escapeHtml(titulo)}
                                                </h1>

                                                <p style="margin:8px 0 0; font-size:14px; color:#dbeafe;">
                                                    ${escapeHtml(descripcion)}
                                                </p>
                                            </td>
                                        </tr>
                                    </table>
                                </td>
                            </tr>

                            <!-- Body -->
                            <tr>
                                <td style="padding:28px 32px;">
                                    <p style="margin:0 0 18px; font-size:15px; line-height:1.7; color:#334155;">
                                        ${mensajeSeguro}
                                    </p>

                                    <!-- Summary box -->
                                    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin:22px 0; border:1px solid #e2e8f0; border-radius:14px; overflow:hidden;">
                                        <tr>
                                            <td style="background:#f8fafc; padding:16px 18px; border-bottom:1px solid #e2e8f0;">
                                                <div style="font-size:13px; color:#64748b; text-transform:uppercase; letter-spacing:0.05em; font-weight:bold;">
                                                    Resumen del informe
                                                </div>
                                            </td>
                                        </tr>

                                        <tr>
                                            <td style="padding:18px;">
                                                <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                                                    <tr>
                                                        <td style="padding:6px 0; width:120px; font-size:14px; color:#64748b;">
                                                            Empresa
                                                        </td>
                                                        <td style="padding:6px 0; font-size:14px; color:#0f172a; font-weight:bold;">
                                                            ${escapeHtml(empresa)}
                                                        </td>
                                                    </tr>

                                                    <tr>
                                                        <td style="padding:6px 0; width:120px; font-size:14px; color:#64748b;">
                                                            Período
                                                        </td>
                                                        <td style="padding:6px 0; font-size:14px; color:#0f172a; font-weight:bold;">
                                                            ${escapeHtml(periodo)}
                                                        </td>
                                                    </tr>

                                                    <tr>
                                                        <td style="padding:6px 0; width:120px; font-size:14px; color:#64748b;">
                                                            Tipo
                                                        </td>
                                                        <td style="padding:6px 0; font-size:14px; color:#0f172a; font-weight:bold;">
                                                            ${escapeHtml(tipoArchivo)}
                                                        </td>
                                                    </tr>
                                                </table>
                                            </td>
                                        </tr>
                                    </table>

                                    <p style="margin:22px 0 0; font-size:13px; line-height:1.6; color:#64748b;">
                                        Este correo fue enviado automáticamente desde el módulo de reportes de RIDS.
                                        Ante cualquier duda, favor responder a este mismo correo o contactar al equipo de soporte (soporte@rids.cl).
                                    </p>
                                </td>
                            </tr>

                            <!-- Footer -->
                            <tr>
                                <td style="background:#f8fafc; border-top:1px solid #e2e8f0; padding:18px 32px;">
                                    <p style="margin:0; font-size:12px; color:#94a3b8; text-align:center;">
                                        Asesorías RIDS Ltda. · Soporte TI · Reportes Operativos
                                    </p>
                                </td>
                            </tr>

                        </table>
                    </td>
                </tr>
            </table>
        </div>
    `;
}
export async function enviarInformeResumenPorCorreo(params) {
    const to = normalizeEmailList(params.to);
    const cc = normalizeEmailList(params.cc);
    if (to.length === 0) {
        throw new Error("Debes ingresar al menos un correo destinatario.");
    }
    validateEmailList(to, "destinatarios");
    if (cc.length > 0) {
        validateEmailList(cc, "CC");
    }
    if (!params.subject?.trim()) {
        throw new Error("Debes ingresar un asunto.");
    }
    if (!params.fileName || !params.mimeType || !params.fileBase64) {
        throw new Error("No se recibió el archivo del informe.");
    }
    const allowedMimeTypes = [
        "application/pdf",
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ];
    if (!allowedMimeTypes.includes(params.mimeType)) {
        throw new Error("Tipo de archivo no permitido para envío por correo.");
    }
    // Validación simple de tamaño para evitar adjuntos demasiado grandes.
    const sizeMb = Buffer.byteLength(params.fileBase64, "base64") / (1024 * 1024);
    if (sizeMb > 20) {
        throw new Error("El informe es demasiado grande para enviarlo por correo.");
    }
    const fileBuffer = Buffer.from(params.fileBase64, "base64");
    await transporter.sendMail({
        from: process.env.SMTP_USER ||
            `"RIDS Reportes" <${process.env.SMTP_USER}>`,
        to,
        cc: cc.length > 0 ? cc : undefined,
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