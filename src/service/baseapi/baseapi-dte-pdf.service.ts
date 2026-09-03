// src/service/baseapi/baseapi-dte-pdf.service.ts

import {
    chromium,
} from "playwright";

import {
    consultarDtePorFolioBaseApi,
    parseDteXmlForDb,
    extractTedXml,
} from "./baseapi-dte.service.js";

import type {
    EmpresaBaseApiKey,
} from "./baseapi.empresas.js";

import bwipjs from "bwip-js";

import {
    readFile,
} from "node:fs/promises";

import path from "node:path";

/* =========================================================
   TYPES
========================================================= */

export type GenerarDtePdfParams = {
    empresa:
    EmpresaBaseApiKey;

    periodo:
    string;

    folio:
    string | number;

    tipoDTE?:
    string | number;

    forceRefresh?:
    boolean;
};

export type GenerarDtePdfResult = {
    buffer:
    Buffer;

    filename:
    string;
};

type EmpresaPdfConfig = {
    nombre:
    string;

    rut:
    string;

    direccion:
    string;

    correo:
    string;

    telefono:
    string;

    logoPath:
    string;
};

const EMPRESAS_PDF:
    Record<
        EmpresaBaseApiKey,
        EmpresaPdfConfig
    > = {
    rids: {
        nombre:
            "ASESORÍAS RIDS LTDA.",

        rut:
            "77.825.186-8",

        direccion:
            "Santiago, Chile",

        correo:
            "soporte@rids.cl",

        telefono:
            "+56 9 8823 1976",

        logoPath:
            path.resolve(
                process.cwd(),
                "assets",
                "pdf-logos",
                "rids.png"
            ),
    },

    econnet: {
        nombre:
            "ECONNET",

        rut:
            "76.758.352-4",

        direccion:
            "Santiago, Chile",

        correo:
            "contacto@econnet.cl",

        telefono:
            "",

        logoPath:
            path.resolve(
                process.cwd(),
                "assets",
                "pdf-logos",
                "econnet.png"
            ),
    },
};

/* =========================================================
   HELPERS
========================================================= */

function getNombreDtePDF(
    tipoDTE?:
        string | number,

    tipoDTEString?:
        string
): string {
    if (
        tipoDTEString
    ) {
        return String(
            tipoDTEString
        ).toUpperCase();
    }

    const tipo =
        Number(
            tipoDTE
        );

    if (
        tipo === 33
    ) {
        return "FACTURA ELECTRÓNICA";
    }

    if (
        tipo === 34
    ) {
        return "FACTURA NO AFECTA O EXENTA ELECTRÓNICA";
    }

    if (
        tipo === 39
    ) {
        return "BOLETA ELECTRÓNICA";
    }

    if (
        tipo === 41
    ) {
        return "BOLETA EXENTA ELECTRÓNICA";
    }

    if (
        tipo === 56
    ) {
        return "NOTA DE DÉBITO ELECTRÓNICA";
    }

    if (
        tipo === 61
    ) {
        return "NOTA DE CRÉDITO ELECTRÓNICA";
    }

    return `DTE ${tipoDTE ?? ""}`;
}

function getTituloResumenPDF(
    tipoDTE?:
        string | number
): string {
    const tipo =
        Number(
            tipoDTE
        );

    if (
        tipo === 33
    ) {
        return "RESUMEN DE FACTURA ELECTRÓNICA";
    }

    if (
        tipo === 34
    ) {
        return "RESUMEN DE FACTURA EXENTA";
    }

    if (
        tipo === 61
    ) {
        return "RESUMEN DE NOTA DE CRÉDITO";
    }

    return "RESUMEN DE DOCUMENTO TRIBUTARIO";
}

function getNombreArchivoPDF(
    tipoDTE:
        string | number,

    folio:
        string | number
): string {
    const tipo =
        Number(
            tipoDTE
        );

    if (
        tipo === 34
    ) {
        return `Factura_Exenta_${folio}.pdf`;
    }

    if (
        tipo === 33
    ) {
        return `Factura_${folio}.pdf`;
    }

    if (
        tipo === 61
    ) {
        return `Nota_Credito_${folio}.pdf`;
    }

    if (
        tipo === 56
    ) {
        return `Nota_Debito_${folio}.pdf`;
    }

    return `DTE_${folio}.pdf`;
}

function formatCLP(
    value: unknown
): string {
    const numero =
        Number(
            value ??
            0
        );

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
        Number.isFinite(
            numero
        )
            ? numero
            : 0
    );
}

function escapeHtml(
    input: unknown
): string {
    if (
        input === undefined ||
        input === null
    ) {
        return "";
    }

    return String(
        input
    )
        .replace(
            /&/g,
            "&amp;"
        )
        .replace(
            /</g,
            "&lt;"
        )
        .replace(
            />/g,
            "&gt;"
        )
        .replace(
            /"/g,
            "&quot;"
        )
        .replace(
            /'/g,
            "&#039;"
        );
}

function formatearFechaPdf(
    value: unknown
): string {
    if (
        !value
    ) {
        return "-";
    }

    if (
        value instanceof Date
    ) {
        if (
            Number.isNaN(
                value.getTime()
            )
        ) {
            return "-";
        }

        return [
            String(
                value.getUTCDate()
            ).padStart(
                2,
                "0"
            ),

            String(
                value.getUTCMonth() +
                1
            ).padStart(
                2,
                "0"
            ),

            value
                .getUTCFullYear(),
        ].join("/");
    }

    const raw =
        String(
            value
        ).trim();

    const match =
        /^(\d{4})-(\d{2})-(\d{2})/.exec(
            raw
        );

    if (
        match
    ) {
        return `${match[3]}/${match[2]}/${match[1]}`;
    }

    return raw;
}

async function cargarImagenComoDataUrl(
    filePath: string
): Promise<string | null> {
    try {
        const buffer =
            await readFile(
                filePath
            );

        const extension =
            path
                .extname(
                    filePath
                )
                .toLowerCase();

        let mimeType =
            "image/png";

        if (
            extension ===
            ".jpg" ||
            extension ===
            ".jpeg"
        ) {
            mimeType =
                "image/jpeg";
        } else if (
            extension ===
            ".webp"
        ) {
            mimeType =
                "image/webp";
        }

        return `data:${mimeType};base64,${buffer.toString(
            "base64"
        )}`;
    } catch (
    error
    ) {
        console.error(
            "❌ No se pudo cargar logo PDF:",
            {
                filePath,

                error:
                    error instanceof Error
                        ? error.message
                        : String(
                            error
                        ),
            }
        );

        return null;
    }
}

/* =========================================================
   HTML DTE
========================================================= */

function construirHtmlDte(
    params: {
        empresaPdf:
        EmpresaPdfConfig;

        logoDataUrl:
        string | null;

        factura:
        any;

        dteXml:
        ReturnType<
            typeof parseDteXmlForDb
        >;

        timbreBase64:
        string | null;

        tipoDTE:
        string | number;

        folio:
        string | number;

        tipoDTELabel:
        string;

        tituloResumen:
        string;
    }
): string {
    const {
        empresaPdf,
        logoDataUrl,
        factura,
        dteXml,
        timbreBase64,
        tipoDTELabel,
        folio,
        tituloResumen,
    } =
        params;

    const items =
        dteXml.items ??
        [];

    const fechaImpresion =
        new Intl.DateTimeFormat(
            "es-CL",
            {
                timeZone:
                    "America/Santiago",

                day:
                    "2-digit",

                month:
                    "2-digit",

                year:
                    "numeric",

                hour:
                    "2-digit",

                minute:
                    "2-digit",

                hour12:
                    false,
            }
        ).format(
            new Date()
        );

    const fechaEmision =
        dteXml.factura
            .fechaEmision;

    const fechaVencimiento =
        dteXml.factura
            .fechaVencimiento;

    const tipoOperacion =
        dteXml.factura
            .tipoVenta ||
        factura
            .tipo_venta ||
        "Del Giro";

    const estado =
        factura
            .estado ||
        "—";

    const detalleHtml =
        items.length >
            0
            ? items
                .map(
                    (
                        item,
                        index
                    ) => `
<tr>

    <td
        style="
            width:8%;
            text-align:center;
        "
    >
        ${escapeHtml(
                        item.linea ??
                        index + 1
                    )}
    </td>

    <td
        style="
            width:52%;
        "
    >
        <b>
            ${escapeHtml(
                        item.nombre ||
                        `Ítem ${index + 1}`
                    )}
        </b>

        ${item.descripcion
                            ? `
                    <br />

                    <span
                        class="item-desc"
                    >
                        ${escapeHtml(
                                item.descripcion
                            )}
                    </span>
                `
                            : ""
                        }

        ${item.codigo
                            ? `
                    <br />

                    <span
                        class="item-meta"
                    >
                        Código:
                        ${escapeHtml(
                                item.codigo
                            )}
                    </span>
                `
                            : ""
                        }

    </td>

    <td
        style="
            width:13%;
            text-align:right;
        "
    >
        ${escapeHtml(
                            item.cantidad ??
                            "—"
                        )}

        ${escapeHtml(
                            item.unidadMedida ??
                            ""
                        )}
    </td>

    <td
        style="
            width:13%;
            text-align:right;
        "
    >
        ${escapeHtml(
                            formatCLP(
                                item.precioUnitario
                            )
                        )}
    </td>

    <td
        style="
            width:14%;
            text-align:right;
            font-weight:bold;
        "
    >
        ${escapeHtml(
                            formatCLP(
                                item.montoItem
                            )
                        )}
    </td>

</tr>
`
                )
                .join(
                    ""
                )
            : `
<tr>

    <td
        colspan="5"
        style="
            text-align:center;
            color:#6b7280;
        "
    >
        No se encontraron ítems reales en el XML del DTE.
    </td>

</tr>
`;

    return `
<!DOCTYPE html>

<html lang="es">

<head>

<meta charset="UTF-8" />

<style>

@page {
    size: A4;
    margin: 0;
}

    * {
        box-sizing:
            border-box;
    }

    html,
    body {
        margin:
            0;

        padding:
            0;

        background:
            #ffffff;

        color:
            #111827;

        font-family:
            Arial,
            Helvetica,
            sans-serif;
    }

    .page {
        width:
            794px;

        min-height:
            1123px;

        padding:
            38px 54px 28px 54px;

        background:
            #ffffff;
    }

    .header {
        display:
            grid;

        grid-template-columns:
            1fr 230px;

        column-gap:
            20px;

        align-items:
            start;
    }

    .empresa {
        display:
            flex;

        gap:
            12px;

        align-items:
            center;

        padding-top:
            10px;
    }

    .empresa-logo {
    width:
        115px;

    height:
        55px;

    object-fit:
        contain;

    object-position:
        center;

    display:
        block;
}

    .logo-placeholder {
        width:
            90px;

        height:
            58px;

        border-radius:
            50%;

        border:
            2px solid #38bdf8;

        color:
            #0891b2;

        display:
            flex;

        align-items:
            center;

        justify-content:
            center;

        font-size:
            32px;

        font-weight:
            bold;
    }

    .empresa-nombre {
        font-size:
            15px;

        font-weight:
            bold;

        letter-spacing:
            .2px;

        margin-bottom:
            2px;
    }

    .empresa-meta {
        font-size:
            9.5px;

        line-height:
            1.3;

        color:
            #374151;
    }

    .fechas {
        text-align:
            right;

        font-size:
            9.5px;

        color:
            #374151;

        margin-bottom:
            8px;
    }

    .sii-box {
        border:
            2.4px solid #111827;

        padding:
            10px 12px 9px 12px;

        text-align:
            center;

        color:
            #c43a3a;

        font-weight:
            bold;

        min-height:
            92px;
    }

    .sii-rut {
        font-size:
            12px;

        margin-bottom:
            8px;
    }

    .sii-tipo {
        font-size:
            12.5px;

        line-height:
            1.18;

        margin-bottom:
            8px;
    }

    .sii-folio {
        font-size:
            13px;

        margin-bottom:
            5px;
    }

    .sii-label {
        font-size:
            10px;

        letter-spacing:
            1.2px;
    }

    .divider {
        border:
            0;

        border-top:
            2px solid #444;

        margin:
            14px 0 18px 0;
    }

    .title {
        font-size:
            16px;

        letter-spacing:
            .2px;

        font-weight:
            500;

        margin:
            0 0 12px 0;
    }

    .cards {
        display:
            grid;

        grid-template-columns:
            1fr 1fr;

        gap:
            14px;

        margin-bottom:
            31px;
    }

    .card {
        border:
            1px solid #d7d7d7;

        border-radius:
            8px;

        padding:
            17px 15px;

        min-height:
            158px;

        font-size:
            12px;

        line-height:
            1.45;
    }

    .card.blue {
        background:
            #eef6ff;

        border-color:
            #c7dff6;
    }

    .card.gray {
        background:
            #fafafa;
    }

    .card-title {
        font-weight:
            normal;

        font-size:
            12px;

        margin-bottom:
            10px;
    }

    .row {
        margin:
            1px 0;
    }

    .section-title {
        font-size:
            15px;

        font-weight:
            500;

        margin:
            0 0 8px 0;
    }

    table {
        width:
            100%;

        border-collapse:
            collapse;

        font-size:
            10px;
    }

    th {
        background:
            #e9ecef;

        border:
            1px solid #cfd4da;

        text-align:
            center;

        padding:
            8px;

        font-weight:
            bold;
    }

    td {
        border:
            1px solid #d8d8d8;

        padding:
            8px 10px;

        vertical-align:
            top;
    }

    .text-right {
        text-align:
            right;

        font-weight:
            bold;
    }

    .item-desc {
        font-size:
            9px;

        color:
            #555;
    }

    .item-meta {
        font-size:
            9px;

        color:
            #777;
    }

    .totales {
        width:
            290px;

        margin-left:
            auto;

        margin-top:
            19px;

        border:
            1px solid #d1d5db;

        border-radius:
            8px;

        overflow:
            hidden;

        font-size:
            12px;
    }

    .totales-row {
        display:
            flex;

        justify-content:
            space-between;

        padding:
            12px 14px;

        border-bottom:
            1px solid #e5e7eb;
    }

    .totales-row:last-child {
        border-bottom:
            none;

        background:
            #fff8d8;

        font-size:
            14px;

        font-weight:
            bold;
    }

    .observaciones {
        margin-top:
            37px;

        border:
            1px solid #d1d5db;

        border-radius:
            8px;

        background:
            #fafafa;

        padding:
            13px 14px;

        font-size:
            12px;

        line-height:
            1.35;
    }

    .timbre {
        margin-top:
            20px;

        display:
            flex;

        align-items:
            flex-start;

        gap:
            16px;
    }

    .timbre-img {
        width:
            220px;

        height:
            auto;

        object-fit:
            contain;

        background:
            #ffffff;
    }

    .timbre-leyenda {
        font-size:
            10px;

        line-height:
            1.5;

        color:
            #374151;

        padding-top:
            4px;
    }

    .footer {
        margin-top:
            22px;

        text-align:
            right;

        color:
            #6b7280;

        font-size:
            10px;
    }

</style>

</head>

<body>

<div class="page">

    <div class="header">

        <div class="empresa">

            ${logoDataUrl
            ? `
            <img
                src="${logoDataUrl}"
                class="empresa-logo"
                alt="${escapeHtml(
                empresaPdf.nombre
            )}"
            />
        `
            : `
            <div class="logo-placeholder">
                ${escapeHtml(
                empresaPdf
                    .nombre
                    .slice(
                        0,
                        1
                    )
            )}
            </div>
        `
        }

            <div>

                <div class="empresa-nombre">
                    ${escapeHtml(
            empresaPdf
                .nombre
        )}
                </div>

                <div class="empresa-meta">

                    RUT:
                    ${escapeHtml(
            empresaPdf
                .rut
        )}

                    <br />

                    ${escapeHtml(
            empresaPdf
                .direccion
        )}

                    <br />

                    ${escapeHtml(
            empresaPdf
                .correo
        )}

                    ${empresaPdf
            .telefono
            ? ` · ${escapeHtml(
                empresaPdf
                    .telefono
            )}`
            : ""
        }

                </div>

            </div>

        </div>

        <div>

            <div class="fechas">

                Fecha impresión:
                ${escapeHtml(
            fechaImpresion
        )}

                <br />

                Fecha emisión:
                ${escapeHtml(
            formatearFechaPdf(
                fechaEmision
            )
        )}

            </div>

            <div class="sii-box">

                <div class="sii-rut">
                    R.U.T.:
                    ${escapeHtml(
            empresaPdf
                .rut
        )}
                </div>

                <div class="sii-tipo">
                    ${escapeHtml(
            tipoDTELabel
        )}
                </div>

                <div class="sii-folio">
                    N° ${escapeHtml(
            folio
        )}
                </div>

                <div class="sii-label">
                    S.I.I.
                </div>

            </div>

        </div>

    </div>

    <hr class="divider" />

    <h1 class="title">
        ${escapeHtml(
            tituloResumen
        )}
    </h1>

    <div class="cards">

        <div class="card gray">

            <div class="card-title">
                Datos del Cliente
            </div>

            <div class="row">
                <b>Razón social:</b>

                ${escapeHtml(
            dteXml.factura
                .razonSocialReceptor ||
            "—"
        )}
            </div>

            <div class="row">
                <b>RUT:</b>

                ${escapeHtml(
            dteXml.factura
                .rutReceptor ||
            "—"
        )}
            </div>

            <div class="row">
                <b>Giro:</b>

                ${escapeHtml(
            dteXml.factura
                .giroReceptor ||
            "—"
        )}
            </div>

            <div class="row">
                <b>Dirección:</b>

                ${escapeHtml(
            dteXml.factura
                .direccionReceptor ||
            "—"
        )}
            </div>

            <div class="row">
                <b>Comuna:</b>

                ${escapeHtml(
            dteXml.factura
                .comunaReceptor ||
            "—"
        )}
            </div>

            <div class="row">
                <b>Ciudad:</b>

                ${escapeHtml(
            dteXml.factura
                .ciudadReceptor ||
            "—"
        )}
            </div>

        </div>

        <div class="card blue">

            <div class="card-title">
                Datos del Documento
            </div>

            <div class="row">
                <b>Tipo DTE:</b>

                ${escapeHtml(
            tipoDTELabel
        )}
            </div>

            <div class="row">
                <b>Tipo operación:</b>

                ${escapeHtml(
            tipoOperacion
        )}
            </div>

            <div class="row">
                <b>Folio:</b>

                ${escapeHtml(
            folio
        )}
            </div>

            <div class="row">
                <b>Estado:</b>

                ${escapeHtml(
            estado
        )}
            </div>

            <div class="row">
                <b>Fecha emisión:</b>

                ${escapeHtml(
            formatearFechaPdf(
                fechaEmision
            )
        )}
            </div>

            <div class="row">
                <b>Fecha vencimiento:</b>

                ${escapeHtml(
            formatearFechaPdf(
                fechaVencimiento
            )
        )}
            </div>

        </div>

    </div>

    <h2 class="section-title">
        Resumen del documento
    </h2>

    <table>

        <thead>

            <tr>

                <th style="width:8%;">
                    #
                </th>

                <th style="width:52%;">
                    Descripción
                </th>

                <th style="width:13%;">
                    Cantidad
                </th>

                <th style="width:13%;">
                    Precio
                </th>

                <th style="width:14%;">
                    Total
                </th>

            </tr>

        </thead>

        <tbody>
            ${detalleHtml}
        </tbody>

    </table>

    <div class="totales">

        <div class="totales-row">

            <span>
                Exento
            </span>

            <span>
                ${escapeHtml(
            formatCLP(
                dteXml.factura
                    .montoExento
            )
        )}
            </span>

        </div>

        <div class="totales-row">

            <span>
                Neto
            </span>

            <span>
                ${escapeHtml(
            formatCLP(
                dteXml.factura
                    .montoNeto
            )
        )}
            </span>

        </div>

        <div class="totales-row">

            <span>
                IVA
            </span>

            <span>
                ${escapeHtml(
            formatCLP(
                dteXml.factura
                    .montoIVA
            )
        )}
            </span>

        </div>

        <div class="totales-row">

            <span>
                Total
            </span>

            <span>
                ${escapeHtml(
            formatCLP(
                dteXml.factura
                    .montoTotal
            )
        )}
            </span>

        </div>

    </div>

    <div class="observaciones">

        <div
            style="
                margin-bottom:4px;
            "
        >
            Observaciones
        </div>

    </div>

    ${timbreBase64
            ? `
<div class="timbre">

    <img
        src="data:image/png;base64,${timbreBase64}"
        class="timbre-img"
    />

    <div class="timbre-leyenda">

        Timbre Electrónico SII

        <br />

        Res. 80 de 2014 -
        Verifique documento:
        www.sii.cl

    </div>

</div>
`
            : ""
        }

    <div class="footer">
        Documento generado automáticamente desde el módulo de facturación.
    </div>

</div>

</body>

</html>
`;
}

/* =========================================================
   GENERAR
========================================================= */

async function generarTimbrePdf417Base64(
    tedXml: string
): Promise<string | null> {
    try {
        const options = {
            bcid:
                "pdf417",

            text:
                tedXml,

            scale:
                3,

            eclevel:
                5,

            includetext:
                false,

            backgroundcolor:
                "FFFFFF",
        };

        const bwip =
            bwipjs as any;

        const buffer =
            await bwip.toBuffer(
                options
            );

        return Buffer
            .from(
                buffer
            )
            .toString(
                "base64"
            );
    } catch (
    error
    ) {
        console.error(
            "❌ Error generando PDF417 DTE:",
            error
        );

        return null;
    }
}

export async function generarDtePdfBuffer(
    params:
        GenerarDtePdfParams
): Promise<
    GenerarDtePdfResult
> {
    const resultado =
        await consultarDtePorFolioBaseApi({
            empresa:
                params.empresa,

            periodo:
                params.periodo,

            folio:
                params.folio,

            tipoDTE:
                params.tipoDTE ??
                33,

            forceRefresh:
                params.forceRefresh ??
                false,
        });

    const factura =
        (resultado.data as any)
            ?.data
            ?.documento;

    if (
        !factura
    ) {
        throw new Error(
            "No fue posible obtener los datos del DTE para generar el PDF"
        );
    }

    const xmlBase64 =
        String(
            factura
                .xml_base64 ??
            ""
        );

    let xmlRaw =
        "";

    if (
        xmlBase64
    ) {
        try {
            xmlRaw =
                Buffer
                    .from(
                        xmlBase64,
                        "base64"
                    )
                    .toString(
                        "utf8"
                    );
        } catch {
            xmlRaw =
                "";
        }
    }

    const dteXml =
        xmlRaw
            ? parseDteXmlForDb(
                xmlRaw
            )
            : null;

    if (
        !dteXml
    ) {
        throw new Error(
            `No fue posible interpretar el XML del DTE ${params.folio}`
        );
    }

    const empresaPdf =
        EMPRESAS_PDF[
        params.empresa
        ];

    const logoDataUrl =
        await cargarImagenComoDataUrl(
            empresaPdf.logoPath
        );

    /*
 * Log temporal para comprobar
 * que Railway/local encuentra el logo.
 */
    console.log(
        "🖼️ Logo PDF DTE:",
        {
            empresa:
                params.empresa,

            logoPath:
                empresaPdf.logoPath,

            cargado:
                Boolean(
                    logoDataUrl
                ),
        }
    );

    const tipoDTE =
        dteXml.factura
            .tipoDTE ??
        factura.tipo_dte ??
        params.tipoDTE ??
        33;

    const folio =
        dteXml.factura
            .folio ??
        factura.folio ??
        params.folio;

    const tipoDTELabel =
        getNombreDtePDF(
            tipoDTE,
            factura
                .tipo_dte_nombre
        );

    const tituloResumen =
        getTituloResumenPDF(
            tipoDTE
        );

    const tedXml =
        String(
            factura
                .ted_xml ??
            ""
        ).trim() ||
        extractTedXml(
            xmlRaw
        );

    const timbreBase64 =
        tedXml
            ? await generarTimbrePdf417Base64(
                tedXml
            )
            : null;

    const html =
        construirHtmlDte({
            empresaPdf,

            logoDataUrl,

            factura,

            dteXml,

            timbreBase64,

            tipoDTE,

            folio,

            tipoDTELabel,

            tituloResumen,
        });

    const browser =
        await chromium.launch({
            args: [
                "--no-sandbox",
            ],
        });

    try {
        const page =
            await browser.newPage({
                viewport: {
                    width:
                        794,

                    height:
                        1123,
                },
            });

        await page.setContent(
            html,
            {
                waitUntil:
                    "networkidle",
            }
        );

        /*
         * Esperamos a que el PDF417 embebido
         * haya terminado de cargarse.
         */
        await page.evaluate(
            async () => {
                const images =
                    Array.from(
                        document.images
                    );

                await Promise.all(
                    images.map(
                        (
                            image
                        ) => {
                            if (
                                image.complete
                            ) {
                                return Promise.resolve();
                            }

                            return new Promise<void>(
                                (
                                    resolve
                                ) => {
                                    image.onload =
                                        () =>
                                            resolve();

                                    image.onerror =
                                        () =>
                                            resolve();
                                }
                            );
                        }
                    )
                );
            }
        );

        const pdf =
            await page.pdf({
                format:
                    "A4",

                printBackground:
                    true,

                margin: {
                    top:
                        "0mm",

                    right:
                        "0mm",

                    bottom:
                        "0mm",

                    left:
                        "0mm",
                },
            });

        /*
         * Playwright puede entregar Uint8Array.
         * Normalizamos a Buffer para Nodemailer/Express.
         */
        const buffer =
            Buffer.from(
                pdf
            );

        return {
            buffer,

            filename:
                getNombreArchivoPDF(
                    tipoDTE,
                    folio
                ),
        };
    } finally {
        await browser.close();
    }
}