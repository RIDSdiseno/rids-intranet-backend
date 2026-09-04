// src/service/baseapi/cobranza/cobranza-email.service.ts
import { transporter, } from "../../../lib/mailer.js";
import { getConfigCorreoEmpresa, getNombreEmpresaCobranza, } from "./cobranza-empresa.config.js";
/* =========================================================
   HELPERS
========================================================= */
function escaparHtml(value) {
    return String(value ??
        "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}
function formatearMontoClp(monto) {
    return new Intl.NumberFormat("es-CL", {
        style: "currency",
        currency: "CLP",
        maximumFractionDigits: 0,
    }).format(monto);
}
function formatearFechaChile(fechaIso) {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(fechaIso);
    if (!match) {
        return fechaIso;
    }
    return `${match[3]}/${match[2]}/${match[1]}`;
}
function getTituloCorreo(tipoRecordatorio) {
    switch (tipoRecordatorio) {
        case "POR_VENCER_7_DIAS":
            return "Factura por vencer";
        case "POR_VENCER_3_DIAS":
            return "Factura por vencer";
        case "VENCE_HOY":
            return "Factura vence hoy";
        case "VENCIDA_3_DIAS":
        case "VENCIDA_7_DIAS":
        case "VENCIDA_15_DIAS":
        case "VENCIDA_30_DIAS":
            return "Factura vencida";
        default:
            return "Recordatorio de pago";
    }
}
function renderDatoPago(label, value) {
    const limpio = value
        .trim();
    if (!limpio) {
        return "";
    }
    return `
<tr>
    <td
        style="
            padding:11px 14px;
            width:38%;
            background:#F8FAFC;
            border-bottom:1px solid #E5E7EB;
            color:#64748B;
            font-size:13px;
        "
    >
        ${escaparHtml(label)}
    </td>

    <td
        style="
            padding:11px 14px;
            border-bottom:1px solid #E5E7EB;
            color:#0F172A;
            font-size:14px;
            font-weight:600;
        "
    >
        ${escaparHtml(limpio)}
    </td>
</tr>
`;
}
/* =========================================================
   ASUNTO
========================================================= */
export function construirAsuntoCobranza(params) {
    const empresa = getNombreEmpresaCobranza(params.empresaKey);
    switch (params.tipoRecordatorio) {
        case "POR_VENCER_7_DIAS":
        case "POR_VENCER_3_DIAS":
            return `${empresa} - Recordatorio de vencimiento factura N° ${params.folio}`;
        case "VENCE_HOY":
            return `${empresa} - Factura N° ${params.folio} vence hoy`;
        default:
            return `${empresa} - Recordatorio de pago factura N° ${params.folio}`;
    }
}
/* =========================================================
   HTML
========================================================= */
function construirHtmlCobranza(params) {
    const config = getConfigCorreoEmpresa(params.empresaKey);
    const empresa = config.nombre;
    const datosPago = config.datosPago;
    const nombre = params.nombreDestino
        ?.trim() ||
        "Estimado(a)";
    const monto = formatearMontoClp(params.montoTotal);
    const vencimiento = formatearFechaChile(params.fechaVencimiento);
    const titulo = getTituloCorreo(params.tipoRecordatorio);
    let mensajeEstado = "";
    if (params.diasDiferencia <
        0) {
        const dias = Math.abs(params.diasDiferencia);
        mensajeEstado =
            `La factura tiene fecha de vencimiento el ${vencimiento}, dentro de ${dias} día${dias === 1 ? "" : "s"}.`;
    }
    else if (params.diasDiferencia ===
        0) {
        mensajeEstado =
            `La factura indicada tiene fecha de vencimiento el día de hoy, ${vencimiento}.`;
    }
    else {
        mensajeEstado =
            `La factura presenta ${params.diasDiferencia} día${params.diasDiferencia === 1 ? "" : "s"} desde su fecha de vencimiento (${vencimiento}).`;
    }
    const datosPagoHtml = [
        renderDatoPago("Beneficiario", datosPago.beneficiario),
        renderDatoPago("RUT", datosPago.rut),
        renderDatoPago("Banco", datosPago.banco),
        renderDatoPago("Tipo de cuenta", datosPago.tipoCuenta),
        renderDatoPago("N° de cuenta", datosPago.numeroCuenta),
        renderDatoPago("Correo", datosPago.emailPago),
    ]
        .filter(Boolean)
        .join("");
    return `
<!DOCTYPE html>

<html lang="es">

<head>
    <meta charset="UTF-8" />

    <meta
        name="viewport"
        content="width=device-width, initial-scale=1.0"
    />
</head>

<body
    style="
        margin:0;
        padding:0;
        background:#E9EEF3;
        font-family:Arial,Helvetica,sans-serif;
        color:#1F2937;
    "
>

<table
    width="100%"
    cellpadding="0"
    cellspacing="0"
    border="0"
    style="
        width:100%;
        background:#E9EEF3;
        border-collapse:collapse;
    "
>

<tr>

<td
    align="center"
    style="
        padding:30px 12px;
    "
>

<table
    width="100%"
    cellpadding="0"
    cellspacing="0"
    border="0"
    style="
        width:100%;
        max-width:650px;
        background:#FFFFFF;
        border-collapse:separate;
        border-spacing:0;
        border-radius:14px;
        overflow:hidden;
        border:1px solid #DDE3EA;
    "
>

<!-- =====================================================
     CABECERA
===================================================== -->

<tr>

<td
    style="
        padding:30px 32px 24px;
        background:#FFFFFF;
    "
>

    <div
        style="
            font-size:26px;
            font-weight:800;
            color:#111827;
            line-height:1.2;
        "
    >
        ${escaparHtml(empresa)}
    </div>

    <div
        style="
            margin-top:6px;
            font-size:13px;
            color:#64748B;
        "
    >
        Gestión de facturación y cobranza
    </div>

</td>

</tr>

<!-- =====================================================
     BANNER
===================================================== -->

<tr>

<td
    style="
        padding:18px 32px;
        background:${config.colorPrimario};
        color:#FFFFFF;
    "
>

    <div
        style="
            font-size:22px;
            font-weight:700;
            line-height:1.25;
        "
    >
        ${escaparHtml(titulo)}
    </div>

</td>

</tr>

<!-- =====================================================
     CONTENIDO
===================================================== -->

<tr>

<td
    style="
        padding:30px 32px;
        font-size:14px;
        line-height:1.65;
    "
>

    <p
        style="
            margin:0 0 18px;
            color:#334155;
        "
    >
        ${escaparHtml(nombre)}:
    </p>

    <p
        style="
            margin:0 0 18px;
            color:#334155;
        "
    >
        Junto con saludar, enviamos este recordatorio
        relacionado con la siguiente factura:
    </p>

    <!-- =================================================
         RESUMEN FACTURA
    ================================================== -->

    <table
        width="100%"
        cellpadding="0"
        cellspacing="0"
        border="0"
        style="
            width:100%;
            margin:22px 0;
            border-collapse:separate;
            border-spacing:0;
            border:1px solid #E5E7EB;
            border-radius:10px;
            overflow:hidden;
        "
    >

        <tr>

            <td
                style="
                    padding:12px 14px;
                    width:38%;
                    background:#F8FAFC;
                    border-bottom:1px solid #E5E7EB;
                    font-weight:600;
                    color:#64748B;
                "
            >
                Documento
            </td>

            <td
                style="
                    padding:12px 14px;
                    border-bottom:1px solid #E5E7EB;
                    font-weight:700;
                    color:#0F172A;
                "
            >
                Factura N°
                ${escaparHtml(params.folio)}
            </td>

        </tr>

        <tr>

            <td
                style="
                    padding:12px 14px;
                    background:#F8FAFC;
                    border-bottom:1px solid #E5E7EB;
                    font-weight:600;
                    color:#64748B;
                "
            >
                Cliente
            </td>

            <td
                style="
                    padding:12px 14px;
                    border-bottom:1px solid #E5E7EB;
                    color:#0F172A;
                "
            >
                ${escaparHtml(params.razonSocial ??
        "-")}
            </td>

        </tr>

        <tr>

            <td
                style="
                    padding:12px 14px;
                    background:#F8FAFC;
                    border-bottom:1px solid #E5E7EB;
                    font-weight:600;
                    color:#64748B;
                "
            >
                Monto total
            </td>

            <td
                style="
                    padding:12px 14px;
                    border-bottom:1px solid #E5E7EB;
                    font-size:17px;
                    font-weight:800;
                    color:#0F172A;
                "
            >
                ${escaparHtml(monto)}
            </td>

        </tr>

        <tr>

            <td
                style="
                    padding:12px 14px;
                    background:#F8FAFC;
                    font-weight:600;
                    color:#64748B;
                "
            >
                Fecha de vencimiento
            </td>

            <td
                style="
                    padding:12px 14px;
                    font-weight:700;
                    color:#0F172A;
                "
            >
                ${escaparHtml(vencimiento)}
            </td>

        </tr>

    </table>

    <!-- =================================================
         ESTADO
    ================================================== -->

    <div
        style="
            margin:20px 0 28px;
            padding:14px 16px;
            background:${config.colorFondoSuave};
            border:1px solid ${config.colorBorde};
            border-radius:10px;
            color:#334155;
            font-size:14px;
            line-height:1.6;
        "
    >
        ${escaparHtml(mensajeEstado)}
    </div>

    <!-- =================================================
         DATOS DE PAGO
    ================================================== -->

    ${datosPagoHtml
        ? `
                <div
                    style="
                        margin-top:28px;
                        font-size:16px;
                        font-weight:700;
                        color:#111827;
                    "
                >
                    Datos de pago
                </div>

                <div
                    style="
                        margin-top:5px;
                        font-size:12px;
                        color:#64748B;
                    "
                >
                    Puede realizar el pago mediante transferencia
                    utilizando los siguientes datos:
                </div>

                <table
                    width="100%"
                    cellpadding="0"
                    cellspacing="0"
                    border="0"
                    style="
                        width:100%;
                        margin-top:14px;
                        border-collapse:separate;
                        border-spacing:0;
                        border:1px solid #E5E7EB;
                        border-radius:10px;
                        overflow:hidden;
                    "
                >
                    ${datosPagoHtml}
                </table>
            `
        : ""}

    ${datosPago
        .observacion
        ?.trim()
        ? `
                <div
                    style="
                        margin-top:12px;
                        padding:12px 14px;
                        background:#F8FAFC;
                        border:1px solid #E5E7EB;
                        border-radius:8px;
                        font-size:12px;
                        line-height:1.55;
                        color:#64748B;
                    "
                >
                    ${escaparHtml(datosPago
            .observacion)}
                </div>
            `
        : ""}

    <!-- =================================================
         PDF ADJUNTO
    ================================================== -->

    ${params.adjuntoPdf
        ? `
                <div
                    style="
                        margin-top:24px;
                        padding:14px 16px;
                        border:1px dashed #CBD5E1;
                        background:#F8FAFC;
                        border-radius:10px;
                        font-size:13px;
                        line-height:1.55;
                        color:#475569;
                    "
                >
                    <strong>
                        Documento adjunto
                    </strong>

                    <br />

                    Se adjunta el archivo
                    <strong>
                        ${escaparHtml(params
            .adjuntoPdf
            .filename)}
                    </strong>
                    para su revisión.
                </div>
            `
        : ""}

    <!-- =================================================
         CIERRE
    ================================================== -->

    <p
        style="
            margin:28px 0 0;
            color:#334155;
        "
    >
        Si el pago ya fue realizado, por favor
        desestime este mensaje o responda este correo
        adjuntando el comprobante correspondiente.
    </p>

    <p
        style="
            margin:18px 0 0;
            color:#334155;
        "
    >
        Ante cualquier duda o si requiere información
        adicional, puede responder directamente a este
        correo.
    </p>

    <p
        style="
            margin:30px 0 0;
            color:#334155;
        "
    >
        Saludos cordiales,

        <br />

        <strong>
            ${escaparHtml(empresa)}
        </strong>
    </p>

</td>

</tr>

<!-- =====================================================
     FOOTER
===================================================== -->

<tr>

<td
    style="
        padding:20px 32px;
        background:#F8FAFC;
        border-top:1px solid #E5E7EB;
        color:#64748B;
        font-size:12px;
        line-height:1.6;
    "
>

    <strong
        style="
            color:#475569;
        "
    >
        ${escaparHtml(empresa)}
    </strong>

    ${config.correo
        ? `
                <br />
                ${escaparHtml(config.correo)}
            `
        : ""}

    ${config.telefono
        ? `
                <br />
                ${escaparHtml(config.telefono)}
            `
        : ""}

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
/* =========================================================
   ENVÍO
========================================================= */
export async function enviarCorreoCobranza(params) {
    try {
        const emailDestino = params.emailDestino
            .trim()
            .toLowerCase();
        if (!emailDestino) {
            return {
                ok: false,
                error: "El destinatario no tiene email",
            };
        }
        const asunto = construirAsuntoCobranza({
            empresaKey: params
                .empresaKey,
            folio: params
                .folio,
            tipoRecordatorio: params
                .tipoRecordatorio,
        });
        const html = construirHtmlCobranza(params);
        /*
         * SEGURIDAD PARA PRUEBAS
         *
         * Mientras COBRANZA_TEST_EMAIL esté definido,
         * todos los emails se redirigen a esa dirección.
         */
        const testEmail = process.env
            .COBRANZA_TEST_EMAIL
            ?.trim();
        const to = testEmail ||
            emailDestino;
        console.log("[COBRANZA EMAIL] 📤 Preparando correo", {
            empresa: params
                .empresaKey,
            folio: params
                .folio,
            destinatarioOriginal: emailDestino,
            destinatarioReal: to,
            modoPrueba: Boolean(testEmail),
            asunto,
        });
        console.log("[COBRANZA EMAIL] 📎 Adjunto", {
            folio: params
                .folio,
            tienePdf: Boolean(params
                .adjuntoPdf),
            archivo: params
                .adjuntoPdf
                ?.filename ??
                null,
            bytes: params
                .adjuntoPdf
                ?.content
                .length ??
                0,
        });
        const resultado = await transporter.sendMail({
            from: process.env
                .SMTP_USER,
            to,
            subject: asunto,
            html,
            ...(params.adjuntoPdf
                ? {
                    attachments: [
                        {
                            filename: params
                                .adjuntoPdf
                                .filename,
                            content: params
                                .adjuntoPdf
                                .content,
                            contentType: "application/pdf",
                        },
                    ],
                }
                : {}),
        });
        console.log("[COBRANZA EMAIL] ✅ Correo enviado", {
            folio: params
                .folio,
            to,
            messageId: resultado
                .messageId,
        });
        return {
            ok: true,
            messageId: resultado
                .messageId,
        };
    }
    catch (error) {
        const message = error instanceof Error
            ? error.message
            : String(error);
        console.error("[COBRANZA EMAIL] ❌ Error enviando correo", {
            folio: params
                .folio,
            email: params
                .emailDestino,
            error: message,
        });
        return {
            ok: false,
            error: message,
        };
    }
}
//# sourceMappingURL=cobranza-email.service.js.map