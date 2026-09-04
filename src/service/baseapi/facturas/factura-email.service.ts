// src/service/baseapi/facturas/factura-email.service.ts

import {
    transporter,
} from "../../../lib/mailer.js";

import type {
    EmpresaBaseApiKey,
} from "../baseapi.empresas.js";

import {
    getConfigCorreoEmpresa,
    getNombreEmpresaCobranza,
} from "../cobranza/cobranza-empresa.config.js";

/* =========================================================
   TYPES
========================================================= */

export type EnviarCorreoFacturaParams = {
    empresaKey:
    EmpresaBaseApiKey;

    emailDestino:
    string;

    nombreDestino?:
    string | null;

    razonSocial?:
    string | null;

    tipoDoc:
    string;

    folio:
    string;

    montoTotal:
    number;

    fechaEmision:
    string;

    adjuntoPdf?: {
        filename:
        string;

        content:
        Buffer;
    };
};

export type ResultadoEnvioCorreoFactura = {
    ok:
    boolean;

    messageId?:
    string;

    error?:
    string;
};

/* =========================================================
   HELPERS
========================================================= */

function escaparHtml(
    value: unknown
): string {
    return String(
        value ??
        ""
    )
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

function formatearMontoClp(
    monto: number
): string {
    return new Intl.NumberFormat(
        "es-CL",
        {
            style:
                "currency",

            currency:
                "CLP",

            maximumFractionDigits:
                0,
        }
    ).format(
        monto
    );
}

function formatearFechaChile(
    fechaIso: string
): string {
    const match =
        /^(\d{4})-(\d{2})-(\d{2})$/.exec(
            fechaIso
        );

    if (
        !match
    ) {
        return fechaIso;
    }

    return `${match[3]}/${match[2]}/${match[1]}`;
}

function getNombreDocumento(
    tipoDoc: string
): string {
    if (
        tipoDoc ===
        "34"
    ) {
        return "Factura Exenta Electrónica";
    }

    return "Factura Electrónica";
}

function renderDatoPago(
    label: string,
    value: string
): string {
    const limpio =
        String(
            value ?? ""
        ).trim();

    if (
        !limpio
    ) {
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
        ${escaparHtml(
        label
    )}
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
        ${escaparHtml(
        limpio
    )}
    </td>
</tr>
`;
}

/* =========================================================
   ASUNTO
========================================================= */

export function construirAsuntoFactura(
    params: {
        empresaKey:
        EmpresaBaseApiKey;

        tipoDoc:
        string;

        folio:
        string;
    }
): string {
    const empresa =
        getNombreEmpresaCobranza(
            params
                .empresaKey
        );

    const documento =
        getNombreDocumento(
            params
                .tipoDoc
        );

    return `${empresa} - ${documento} N° ${params.folio}`;
}

/* =========================================================
   HTML
========================================================= */

function construirHtmlFactura(
    params:
        EnviarCorreoFacturaParams
): string {
    const config =
        getConfigCorreoEmpresa(
            params
                .empresaKey
        );

    const empresa =
        config.nombre;

    const datosPago =
        config.datosPago;

    const nombre =
        params
            .nombreDestino
            ?.trim() ||
        "Estimado(a)";

    const monto =
        formatearMontoClp(
            params
                .montoTotal
        );

    const fechaEmision =
        formatearFechaChile(
            params
                .fechaEmision
        );

    const documento =
        getNombreDocumento(
            params
                .tipoDoc
        );

    const datosPagoHtml =
        [
            renderDatoPago(
                "Beneficiario",
                datosPago.beneficiario
            ),

            renderDatoPago(
                "RUT",
                datosPago.rut
            ),

            renderDatoPago(
                "Banco",
                datosPago.banco
            ),

            renderDatoPago(
                "Tipo de cuenta",
                datosPago.tipoCuenta
            ),

            renderDatoPago(
                "N° de cuenta",
                datosPago.numeroCuenta
            ),

            renderDatoPago(
                "Correo",
                datosPago.emailPago
            ),
        ]
            .filter(
                Boolean
            )
            .join(
                ""
            );

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
        "
    >
        ${escaparHtml(
        empresa
    )}
    </div>

    <div
        style="
            margin-top:6px;
            font-size:13px;
            color:#64748B;
        "
    >
        Facturación electrónica
    </div>

</td>

</tr>

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
        "
    >
        Documento tributario emitido
    </div>

</td>

</tr>

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
        ${escaparHtml(
        nombre
    )}:
    </p>

    <p
        style="
            margin:0 0 18px;
            color:#334155;
        "
    >
        Junto con saludar, informamos la emisión del siguiente
        documento tributario electrónico:
    </p>

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
                "
            >
                ${escaparHtml(
        documento
    )}
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
                Folio
            </td>

            <td
                style="
                    padding:12px 14px;
                    border-bottom:1px solid #E5E7EB;
                    font-weight:700;
                "
            >
                N° ${escaparHtml(
        params
            .folio
    )}
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
                "
            >
                ${escaparHtml(
        params
            .razonSocial ??
        "-"
    )}
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
                Fecha de emisión
            </td>

            <td
                style="
                    padding:12px 14px;
                    border-bottom:1px solid #E5E7EB;
                    font-weight:700;
                "
            >
                ${escaparHtml(
        fechaEmision
    )}
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
                Monto total
            </td>

            <td
                style="
                    padding:12px 14px;
                    font-size:17px;
                    font-weight:800;
                    color:#0F172A;
                "
            >
                ${escaparHtml(
        monto
    )}
            </td>

        </tr>

    </table>

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
            Datos para realizar el pago
        </div>

        <div
            style="
                margin-top:5px;
                font-size:12px;
                color:#64748B;
                line-height:1.5;
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
            : ""
        }

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
            ${escaparHtml(
                datosPago
                    .observacion
            )}
        </div>
    `
            : ""
        }

    ${params.adjuntoPdf
            ? `
        <div
            style="
                margin-top:24px;
                padding:14px 16px;
                border:1px dashed #CBD5E1;
                background:#F8FAFC;
                border-radius:10px;
                color:#475569;
            "
        >
            <strong>
                Documento adjunto
            </strong>

            <br />

            Se adjunta
            <strong>
                ${escaparHtml(
                params
                    .adjuntoPdf
                    .filename
            )}
            </strong>
            para su revisión.
        </div>
    `
            : ""
        }

    <p
        style="
            margin:28px 0 0;
            color:#334155;
        "
    >
        Ante cualquier consulta relacionada con este documento,
        puede responder directamente a este correo.
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
            ${escaparHtml(
            empresa
        )}
        </strong>
    </p>

</td>

</tr>

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

    <strong>
        ${escaparHtml(
            empresa
        )}
    </strong>

    ${config.correo
            ? `
        <br />
        ${escaparHtml(
                config.correo
            )}
    `
            : ""
        }

    ${config.telefono
            ? `
        <br />
        ${escaparHtml(
                config.telefono
            )}
    `
            : ""
        }

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

export async function enviarCorreoFactura(
    params:
        EnviarCorreoFacturaParams
): Promise<
    ResultadoEnvioCorreoFactura
> {
    try {
        const emailDestino =
            params
                .emailDestino
                .trim()
                .toLowerCase();

        if (
            !emailDestino
        ) {
            return {
                ok:
                    false,

                error:
                    "El destinatario no tiene email",
            };
        }

        const asunto =
            construirAsuntoFactura({
                empresaKey:
                    params
                        .empresaKey,

                tipoDoc:
                    params
                        .tipoDoc,

                folio:
                    params
                        .folio,
            });

        const html =
            construirHtmlFactura(
                params
            );

        /*
 * =========================================================
 * SEGURIDAD DE ENVÍO
 * =========================================================
 *
 * Prioridad:
 *
 * 1. Si FACTURA_TEST_EMAIL existe:
 *    siempre redirige el correo a pruebas.
 *
 * 2. Si no existe FACTURA_TEST_EMAIL:
 *    solo permitimos envío real cuando
 *    FACTURA_LIVE_SEND=true.
 *
 * Esto evita que eliminar accidentalmente
 * FACTURA_TEST_EMAIL habilite correos reales.
 */

        const testEmail =
            process.env
                .FACTURA_TEST_EMAIL
                ?.trim()
                .toLowerCase();

        const envioRealHabilitado =
            String(
                process.env
                    .FACTURA_LIVE_SEND ??
                ""
            )
                .trim()
                .toLowerCase() ===
            "true";

        let to:
            string;

        let modoPrueba:
            boolean;

        if (
            testEmail
        ) {
            to =
                testEmail;

            modoPrueba =
                true;
        } else {
            if (
                !envioRealHabilitado
            ) {
                throw new Error(
                    "Envío real de facturas bloqueado: configura FACTURA_TEST_EMAIL o FACTURA_LIVE_SEND=true."
                );
            }

            to =
                emailDestino;

            modoPrueba =
                false;
        }

        console.log(
            "[FACTURA EMAIL] 📤 Preparando correo",
            {
                empresa:
                    params.empresaKey,

                folio:
                    params.folio,

                destinatarioOriginal:
                    emailDestino,

                destinatarioReal:
                    to,

                modoPrueba,

                envioRealHabilitado,

                asunto,

                adjuntaPdf:
                    Boolean(
                        params.adjuntoPdf
                    ),

                archivoPdf:
                    params
                        .adjuntoPdf
                        ?.filename ??
                    null,

                bytesPdf:
                    params
                        .adjuntoPdf
                        ?.content
                        .length ??
                    0,
            }
        );

        const resultado =
            await transporter.sendMail({
                from:
                    process.env
                        .SMTP_USER,

                to,

                subject:
                    asunto,

                html,

                ...(params.adjuntoPdf
                    ? {
                        attachments: [
                            {
                                filename:
                                    params
                                        .adjuntoPdf
                                        .filename,

                                content:
                                    params
                                        .adjuntoPdf
                                        .content,

                                contentType:
                                    "application/pdf",
                            },
                        ],
                    }
                    : {}),
            });

        console.log(
            "[FACTURA EMAIL] ✅ Correo enviado",
            {
                folio:
                    params
                        .folio,

                destinatarioReal:
                    to,

                messageId:
                    resultado
                        .messageId,
            }
        );

        return {
            ok:
                true,

            messageId:
                resultado
                    .messageId,
        };
    } catch (
    error
    ) {
        const message =
            error instanceof Error
                ? error.message
                : String(
                    error
                );

        console.error(
            "[FACTURA EMAIL] ❌ Error enviando correo",
            {
                folio:
                    params
                        .folio,

                email:
                    params
                        .emailDestino,

                error:
                    message,
            }
        );

        return {
            ok:
                false,

            error:
                message,
        };
    }
}