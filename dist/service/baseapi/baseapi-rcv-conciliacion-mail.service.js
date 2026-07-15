import { emailSenderService } from "../email/email-sender.service.js";
function escapeHtml(value) {
    return String(value ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}
function formatClp(value) {
    return new Intl.NumberFormat("es-CL", {
        style: "currency",
        currency: "CLP",
        maximumFractionDigits: 0,
    }).format(Number(value ?? 0));
}
function formatDate(value) {
    if (!value)
        return "-";
    return new Date(value).toLocaleDateString("es-CL", {
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
    });
}
function translateTipoRcv(value) {
    if (value === "ventas")
        return "Ventas";
    if (value === "compras")
        return "Compras";
    return value ?? "-";
}
export async function enviarCorreoConciliacionRcv(params) {
    const { to, conciliacion } = params;
    const subject = `Documento conciliado - Folio ${conciliacion.folio}`;
    const html = `
        <div style="margin:0; padding:0; background:#f8fafc; font-family:Arial, sans-serif; color:#0f172a;">
            <table width="100%" cellpadding="0" cellspacing="0" style="background:#f8fafc; padding:24px 0;">
                <tr>
                    <td align="center">
                        <table width="680" cellpadding="0" cellspacing="0" style="background:#ffffff; border:1px solid #e5e7eb; border-radius:12px; overflow:hidden;">
                            <tr>
                                <td style="background:#059669; padding:20px 24px; color:#ffffff;">
                                    <h2 style="margin:0; font-size:20px;">Documento conciliado</h2>
                                    <p style="margin:6px 0 0; font-size:14px;">
                                        Se ha registrado una conciliación de un documento RCV.
                                    </p>
                                </td>
                            </tr>

                            <tr>
                                <td style="padding:24px;">
                                    <p style="margin-top:0; font-size:14px; line-height:1.6;">
                                        Se informa que el siguiente documento fue conciliado correctamente:
                                    </p>

                                    <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse; font-size:14px;">
                                        <tr>
                                            <td style="padding:10px; border:1px solid #e5e7eb; background:#f9fafb;"><strong>Empresa</strong></td>
                                            <td style="padding:10px; border:1px solid #e5e7eb;">${escapeHtml(conciliacion.empresaKey)}</td>
                                        </tr>

                                        <tr>
                                            <td style="padding:10px; border:1px solid #e5e7eb; background:#f9fafb;"><strong>Tipo RCV</strong></td>
                                            <td style="padding:10px; border:1px solid #e5e7eb;">${escapeHtml(translateTipoRcv(conciliacion.tipoRcv))}</td>
                                        </tr>

                                        <tr>
                                            <td style="padding:10px; border:1px solid #e5e7eb; background:#f9fafb;"><strong>Tipo documento</strong></td>
                                            <td style="padding:10px; border:1px solid #e5e7eb;">${escapeHtml(conciliacion.tipoDoc)}</td>
                                        </tr>

                                        <tr>
                                            <td style="padding:10px; border:1px solid #e5e7eb; background:#f9fafb;"><strong>Folio</strong></td>
                                            <td style="padding:10px; border:1px solid #e5e7eb;">${escapeHtml(conciliacion.folio)}</td>
                                        </tr>

                                        <tr>
                                            <td style="padding:10px; border:1px solid #e5e7eb; background:#f9fafb;"><strong>Razón social</strong></td>
                                            <td style="padding:10px; border:1px solid #e5e7eb;">${escapeHtml(conciliacion.razonSocial ?? "-")}</td>
                                        </tr>

                                        <tr>
                                            <td style="padding:10px; border:1px solid #e5e7eb; background:#f9fafb;"><strong>RUT contraparte</strong></td>
                                            <td style="padding:10px; border:1px solid #e5e7eb;">${escapeHtml(conciliacion.rutContraparte)}</td>
                                        </tr>

                                        <tr>
                                            <td style="padding:10px; border:1px solid #e5e7eb; background:#f9fafb;"><strong>Monto neto</strong></td>
                                            <td style="padding:10px; border:1px solid #e5e7eb;">${formatClp(conciliacion.montoNeto)}</td>
                                        </tr>

                                        <tr>
                                            <td style="padding:10px; border:1px solid #e5e7eb; background:#f9fafb;"><strong>IVA</strong></td>
                                            <td style="padding:10px; border:1px solid #e5e7eb;">${formatClp(conciliacion.montoIva)}</td>
                                        </tr>

                                        <tr>
                                            <td style="padding:10px; border:1px solid #e5e7eb; background:#f9fafb;"><strong>Total</strong></td>
                                            <td style="padding:10px; border:1px solid #e5e7eb;"><strong>${formatClp(conciliacion.montoTotal)}</strong></td>
                                        </tr>

                                        <tr>
                                            <td style="padding:10px; border:1px solid #e5e7eb; background:#f9fafb;"><strong>Forma de pago / conciliación</strong></td>
                                            <td style="padding:10px; border:1px solid #e5e7eb;">${escapeHtml(conciliacion.formaPago ?? "-")}</td>
                                        </tr>

                                        <tr>
                                            <td style="padding:10px; border:1px solid #e5e7eb; background:#f9fafb;"><strong>Fecha conciliación</strong></td>
                                            <td style="padding:10px; border:1px solid #e5e7eb;">${formatDate(conciliacion.conciliadoAt)}</td>
                                        </tr>

                                        <tr>
                                            <td style="padding:10px; border:1px solid #e5e7eb; background:#f9fafb;"><strong>Responsable</strong></td>
                                            <td style="padding:10px; border:1px solid #e5e7eb;">${escapeHtml(conciliacion.responsable ?? "-")}</td>
                                        </tr>

                                        <tr>
                                            <td style="padding:10px; border:1px solid #e5e7eb; background:#f9fafb;"><strong>Observación</strong></td>
                                            <td style="padding:10px; border:1px solid #e5e7eb;">${escapeHtml(conciliacion.observacion ?? "-")}</td>
                                        </tr>
                                    </table>

                                    <p style="margin:20px 0 0; font-size:12px; color:#64748b;">
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
//# sourceMappingURL=baseapi-rcv-conciliacion-mail.service.js.map