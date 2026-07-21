// src/service/baseapi/baseapi-rcv-conciliacion-mail.service.ts
import type { RcvConciliacion } from "@prisma/client";
import { emailSenderService } from "../email/email-sender.service.js";

function escapeHtml(value: unknown): string {
    return String(value ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

function formatClp(value: number | null | undefined) {
    return new Intl.NumberFormat("es-CL", {
        style: "currency",
        currency: "CLP",
        maximumFractionDigits: 0,
    }).format(Number(value ?? 0));
}

function formatDate(value: Date | null | undefined) {
    if (!value) return "-";

    return new Date(value).toLocaleDateString("es-CL", {
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
    });
}

function translateTipoRcv(value: string | null | undefined) {
    if (value === "ventas") return "Ventas";
    if (value === "compras") return "Compras";
    return value ?? "-";
}

const NOMBRES_EMPRESA: Record<string, string> = {
    econnet: "ECONNET",
    rids: "ASESORÍAS RIDS LTDA.",
};

function translateEmpresa(value: string | null | undefined) {
    const key = String(value ?? "").toLowerCase();
    return NOMBRES_EMPRESA[key] ?? String(value ?? "-").toUpperCase();
}

export async function enviarCorreoConciliacionRcv(params: {
    to: string | string[];
    conciliacion: RcvConciliacion;
}) {
    const { to, conciliacion } = params;

    const subject = `Documento conciliado - Folio ${conciliacion.folio}`;

    const empresaNombre = translateEmpresa(conciliacion.empresaKey);

    function fila(label: string, valor: string, destacado = false) {
        return `
            <tr>
                <td style="padding:11px 4px; border-bottom:1px solid #eef2f5; font-size:13px; color:#64748b; white-space:nowrap;">${escapeHtml(label)}</td>
                <td style="padding:11px 4px; border-bottom:1px solid #eef2f5; font-size:14px; text-align:right; color:#0f172a; ${destacado ? "font-weight:700;" : "font-weight:500;"}">${valor}</td>
            </tr>
        `;
    }

    const html = `
        <div style="margin:0; padding:0; background:#f1f5f9; font-family:Arial, sans-serif; color:#0f172a;">
            <table width="100%" cellpadding="0" cellspacing="0" style="background:#f1f5f9; padding:28px 0;">
                <tr>
                    <td align="center">
                        <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px; width:100%; background:#ffffff; border-radius:16px; overflow:hidden; border:1px solid #e2e8f0;">
                            <tr>
                                <td style="background:#059669; padding:22px 28px; color:#ffffff;">
                                    <h2 style="margin:0; font-size:19px; font-weight:700;">Documento conciliado</h2>
                                    <p style="margin:4px 0 0; font-size:13px; color:#d1fae5;">
                                        Se registró la conciliación de un documento RCV.
                                    </p>
                                </td>
                            </tr>

                            <tr>
                                <td style="padding:22px 28px 8px;">
                                    <table width="100%" cellpadding="0" cellspacing="0">
                                        <tr>
                                            <td width="33%" style="padding:2px;">
                                                <div style="background:#f8fafc; border:1px solid #e2e8f0; border-radius:12px; padding:12px; text-align:center;">
                                                    <div style="font-size:10px; font-weight:700; text-transform:uppercase; letter-spacing:0.03em; color:#94a3b8;">Empresa</div>
                                                    <div style="margin-top:4px; font-size:13px; font-weight:700; color:#0f172a;">${escapeHtml(empresaNombre)}</div>
                                                </div>
                                            </td>
                                            <td width="33%" style="padding:2px;">
                                                <div style="background:#f8fafc; border:1px solid #e2e8f0; border-radius:12px; padding:12px; text-align:center;">
                                                    <div style="font-size:10px; font-weight:700; text-transform:uppercase; letter-spacing:0.03em; color:#94a3b8;">Folio</div>
                                                    <div style="margin-top:4px; font-size:13px; font-weight:700; color:#0f172a;">#${escapeHtml(conciliacion.folio)}</div>
                                                </div>
                                            </td>
                                            <td width="34%" style="padding:2px;">
                                                <div style="background:#ecfdf5; border:1px solid #a7f3d0; border-radius:12px; padding:12px; text-align:center;">
                                                    <div style="font-size:10px; font-weight:700; text-transform:uppercase; letter-spacing:0.03em; color:#059669;">Total</div>
                                                    <div style="margin-top:4px; font-size:13px; font-weight:700; color:#047857;">${formatClp(conciliacion.montoTotal)}</div>
                                                </div>
                                            </td>
                                        </tr>
                                    </table>
                                </td>
                            </tr>

                            <tr>
                                <td style="padding:8px 28px 24px;">
                                    <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">
                                        ${fila("Tipo RCV", escapeHtml(translateTipoRcv(conciliacion.tipoRcv)))}
                                        ${fila("Tipo documento", escapeHtml(conciliacion.tipoDoc))}
                                        ${fila("Razón social", escapeHtml(conciliacion.razonSocial ?? "-"))}
                                        ${fila("RUT contraparte", escapeHtml(conciliacion.rutContraparte))}
                                        ${fila("Monto neto", formatClp(conciliacion.montoNeto))}
                                        ${fila("IVA", formatClp(conciliacion.montoIva))}
                                        ${fila("Forma de pago / conciliación", escapeHtml(conciliacion.formaPago ?? "-"))}
                                        ${fila("Fecha conciliación", formatDate(conciliacion.conciliadoAt))}
                                        ${fila("Responsable", escapeHtml(conciliacion.responsable ?? "-"))}
                                        ${fila("Observación", escapeHtml(conciliacion.observacion ?? "-"))}
                                    </table>

                                    <p style="margin:20px 0 0; font-size:11.5px; color:#94a3b8;">
                                        Este correo fue generado automáticamente desde el sistema interno de la empresa.
                                    </p>
                                </td>
                            </tr>
                        </table>
                    </td>
                </tr>
            </table>
        </div>
    `;

    await emailSenderService.sendHtmlEmail({
        to,
        subject,
        html,
    });
}