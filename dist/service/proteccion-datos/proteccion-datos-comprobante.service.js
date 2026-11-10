// src/service/proteccion-datos/proteccion-datos-comprobante.service.ts
/* =========================================================
   COMPROBANTE DE FIRMA

   Al ACEPTAR un consentimiento se envía al firmante un correo
   con un PDF que respalda su firma (folio + código de
   verificación). El PDF también queda en Supabase
   (comprobantes/{campaniaId}/...) y su ruta en evidenciaPath.

   enviarComprobanteFirma() nunca lanza: si algo falla registra
   un evento ERROR_ENVIO con { comprobante: true, error }.
   ========================================================= */
import { createHash, createHmac, } from "node:crypto";
import { existsSync, } from "node:fs";
import path from "node:path";
import PDFDocument from "pdfkit";
import { EstadoConsentimientoDatos, Prisma, TipoEventoConsentimientoDatos, } from "@prisma/client";
import { prisma, } from "../../lib/prisma.js";
import { PROTECCION_DATOS_DOCUMENTOS_BUCKET, supabaseAdmin, } from "../../lib/supabase/supabase.js";
import { sendEmail, } from "../correos-masivos/masivos-email-sender.service.js";
/* =========================================================
   CONFIG
   ========================================================= */
const LOG = "[PROTECCION DATOS] Comprobante";
/** Si el archivo no existe, el PDF se genera sin logo. */
const LOGO = path.resolve(process.cwd(), "src/assets/logo-rids.png");
const ZONA = "America/Santiago";
const CORREO_DERECHOS_DEFECTO = "soporte@rids.cl";
function secretoComprobante() {
    const secreto = process.env
        .PROTECCION_DATOS_COMPROBANTE_SECRET
        ?.trim() ||
        process.env
            .JWT_SECRET
            ?.trim();
    if (!secreto) {
        throw new Error("Falta PROTECCION_DATOS_COMPROBANTE_SECRET (o JWT_SECRET)");
    }
    return secreto;
}
/* =========================================================
   FOLIO Y CÓDIGO
   ========================================================= */
export function folioComprobante(consentimientoId) {
    return String(consentimientoId).padStart(6, "0");
}
/**
 * HMAC-SHA256 sobre los datos de la firma.
 * Primeros 16 hex en mayúsculas, en grupos de 4.
 *
 * Si cambia el secreto, los códigos ya emitidos dejan de validar.
 */
export function codigoVerificacion({ consentimientoId, email, fechaRespuesta, documentoHash, }) {
    const hex = createHmac("sha256", secretoComprobante())
        .update([
        consentimientoId,
        email.trim().toLowerCase(),
        fechaRespuesta.toISOString(),
        documentoHash,
    ].join("|"))
        .digest("hex")
        .slice(0, 16)
        .toUpperCase();
    return (hex.match(/.{4}/g) ??
        [
            hex,
        ]).join("-");
}
/* =========================================================
   HELPERS
   ========================================================= */
function toPrismaJson(value) {
    return JSON.parse(JSON.stringify(value));
}
function esObjeto(value) {
    return (typeof value ===
        "object" &&
        value !==
            null &&
        !Array.isArray(value));
}
function escaparHtml(value) {
    return value
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");
}
function normalizar(value) {
    return value
        .normalize("NFD")
        .replace(/[̀-ͯ]/g, "")
        .trim()
        .toLowerCase();
}
function slug(value, fallback) {
    return (value
        .normalize("NFD")
        .replace(/[̀-ͯ]/g, "")
        .replace(/[^A-Za-z0-9]+/g, "_")
        .replace(/^_+|_+$/g, "")
        .slice(0, 40) ||
        fallback);
}
function fechaLarga(fecha) {
    return new Intl.DateTimeFormat("es-CL", {
        day: "numeric",
        month: "long",
        year: "numeric",
        timeZone: ZONA,
    }).format(fecha);
}
/** Hora 24 h de Chile (nunca "a. m." / "p. m."). */
function horaChile(fecha, conSegundos) {
    return new Intl.DateTimeFormat("es-CL", {
        hour: "2-digit",
        minute: "2-digit",
        ...(conSegundos
            ? {
                second: "2-digit",
            }
            : {}),
        hourCycle: "h23",
        timeZone: ZONA,
    }).format(fecha);
}
function unirTitulos(titulos) {
    if (titulos.length <=
        1) {
        return titulos[0] ??
            "";
    }
    return `${titulos.slice(0, -1).join(", ")} y ${titulos[titulos.length - 1]}`;
}
function esCorreo(value) {
    return (typeof value ===
        "string" &&
        /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim()));
}
/* =========================================================
   CORREO DE DERECHOS
   Ficha Ley PD (pregunta 8: correoPrivacidad) >
   PROTECCION_DATOS_CORREO_DERECHOS > soporte@rids.cl
   ========================================================= */
function correoDerechosEmpresa(datosFicha) {
    if (esObjeto(datosFicha)) {
        const campo = datosFicha.correoPrivacidad;
        if (esObjeto(campo) &&
            esCorreo(campo.valor)) {
            return campo.valor.trim();
        }
    }
    const env = process.env
        .PROTECCION_DATOS_CORREO_DERECHOS
        ?.trim();
    return esCorreo(env)
        ? env
        : CORREO_DERECHOS_DEFECTO;
}
function textoAutorizacion(valor, opciones) {
    if (typeof valor !==
        "string" ||
        !valor.trim()) {
        return "Sin respuesta";
    }
    const opcion = opciones?.find((o) => o.value ===
        valor);
    const candidatos = [
        valor,
        opcion?.label ?? "",
    ].map(normalizar);
    if (candidatos.some((t) => /^(no\b|rechaz|false)/.test(t))) {
        return "No autorizado";
    }
    if (candidatos.some((t) => /^(si\b|acepto|autorizo|true|yes)/.test(t))) {
        return "Autorizado";
    }
    return opcion?.label ??
        valor;
}
function clasificar(campos, respuestas) {
    const resultado = {
        firmante: [],
        declaraciones: [],
        autorizaciones: [],
    };
    for (const campo of campos) {
        const valor = respuestas[campo.key];
        if (campo.tipo ===
            "TEXT") {
            const texto = typeof valor ===
                "string"
                ? valor.trim()
                : "";
            if (campo.obligatorio) {
                resultado.firmante.push({
                    etiqueta: campo.label,
                    valor: texto,
                });
            }
            else if (texto) {
                resultado.autorizaciones.push({
                    etiqueta: campo.label,
                    valor: texto,
                });
            }
            continue;
        }
        if (campo.tipo ===
            "CHECKBOX") {
            if (valor ===
                true) {
                resultado.declaraciones.push(campo.label);
            }
            continue;
        }
        if (campo.tipo ===
            "RADIO") {
            if (campo.obligatorio) {
                const opcion = campo.opciones?.find((o) => o.value ===
                    valor);
                if (opcion) {
                    resultado.declaraciones.push(`${campo.label}: ${opcion.label}`);
                }
            }
            else {
                resultado.autorizaciones.push({
                    etiqueta: campo.label,
                    valor: textoAutorizacion(valor, campo.opciones),
                });
            }
        }
    }
    return resultado;
}
/** Títulos de los documentos del formulario, o tituloDocumento si no hay. */
function documentosFirmados(campos, tituloDocumento) {
    const titulos = new Set();
    for (const campo of campos) {
        for (const d of campo.documentosLeypd ??
            []) {
            if (d.titulo?.trim()) {
                titulos.add(d.titulo.trim());
            }
        }
        for (const d of campo.documentos ??
            []) {
            if (d.titulo?.trim()) {
                titulos.add(d.titulo.trim());
            }
        }
    }
    return titulos.size > 0
        ? unirTitulos([
            ...titulos,
        ])
        : tituloDocumento;
}
const PAGINA = {
    ancho: 595.28,
    alto: 841.89,
};
const MARGEN_X = 40;
const ANCHO = PAGINA.ancho -
    MARGEN_X * 2;
const ALTO_PIE = 64;
const ANCHO_ETIQUETA = 150;
const COLOR = {
    banda: "#0B2545",
    bandaSuave: "#9FC5E8",
    bandaTexto: "#DCE7F3",
    texto: "#1E293B",
    suave: "#64748B",
    linea: "#E2E8F0",
};
export function generarPdfComprobante(datos) {
    return new Promise((resolve, reject) => {
        const doc = new PDFDocument({
            size: "A4",
            margin: 0,
            bufferPages: true,
            info: {
                Title: `Comprobante de firma · ${datos.empresa}`,
                Author: datos.empresa,
                Producer: "Asesorías RIDS",
            },
        });
        const partes = [];
        doc.on("data", (chunk) => partes.push(chunk));
        doc.on("end", () => resolve(Buffer.concat(partes)));
        doc.on("error", reject);
        let y = 0;
        const espacio = (alto) => {
            if (y + alto >
                PAGINA.alto -
                    ALTO_PIE) {
                doc.addPage();
                y =
                    48;
            }
        };
        /* ---------- Banda superior ---------- */
        doc
            .rect(0, 0, PAGINA.ancho, 112)
            .fill(COLOR.banda);
        let xTexto = MARGEN_X;
        if (existsSync(LOGO)) {
            try {
                doc
                    .roundedRect(MARGEN_X, 24, 118, 64, 8)
                    .fill("#FFFFFF");
                doc.image(LOGO, MARGEN_X + 9, 30, {
                    fit: [
                        100,
                        52,
                    ],
                    align: "center",
                    valign: "center",
                });
                xTexto =
                    MARGEN_X +
                        138;
            }
            catch (error) {
                console.warn(`${LOG} ⚠️ No se pudo cargar el logo`, error instanceof Error
                    ? error.message
                    : error);
            }
        }
        const anchoTexto = PAGINA.ancho -
            MARGEN_X -
            xTexto;
        doc
            .font("Helvetica-Bold")
            .fontSize(8.5)
            .fillColor(COLOR.bandaSuave)
            .text(`${datos.empresa.toUpperCase()} · LEY 21.719`, xTexto, 30, {
            width: anchoTexto,
            height: 12,
            ellipsis: true,
            characterSpacing: 0.6,
        });
        doc
            .font("Helvetica-Bold")
            .fontSize(20)
            .fillColor("#FFFFFF")
            .text("Comprobante de firma", xTexto, 45, {
            width: anchoTexto,
        });
        doc
            .font("Helvetica")
            .fontSize(10.5)
            .fillColor(COLOR.bandaTexto)
            .text(datos.tituloFormulario, xTexto, 72, {
            width: anchoTexto,
            height: 28,
            ellipsis: true,
        });
        y =
            136;
        /* ---------- Bloques ---------- */
        const seccion = (titulo) => {
            espacio(40);
            doc
                .font("Helvetica-Bold")
                .fontSize(11)
                .fillColor(COLOR.banda)
                .text(titulo, MARGEN_X, y, {
                width: ANCHO,
            });
            y +=
                16;
            doc
                .moveTo(MARGEN_X, y)
                .lineTo(MARGEN_X +
                ANCHO, y)
                .lineWidth(0.6)
                .strokeColor(COLOR.linea)
                .stroke();
            y +=
                8;
        };
        const filas = (items) => {
            for (const fila of items) {
                const valor = fila.valor ||
                    "—";
                const fuenteValor = fila.mono
                    ? "Courier"
                    : "Helvetica";
                const tamanoValor = fila.mono
                    ? 8.5
                    : 9.5;
                const anchoValor = ANCHO -
                    ANCHO_ETIQUETA;
                doc
                    .font(fuenteValor)
                    .fontSize(tamanoValor);
                const altoValor = doc.heightOfString(valor, {
                    width: anchoValor,
                });
                doc
                    .font("Helvetica")
                    .fontSize(8.5);
                const altoEtiqueta = doc.heightOfString(fila.etiqueta, {
                    width: ANCHO_ETIQUETA -
                        10,
                });
                const alto = Math.max(altoValor, altoEtiqueta);
                espacio(alto +
                    6);
                doc
                    .fillColor(COLOR.suave)
                    .text(fila.etiqueta, MARGEN_X, y + 1, {
                    width: ANCHO_ETIQUETA -
                        10,
                });
                doc
                    .font(fuenteValor)
                    .fontSize(tamanoValor)
                    .fillColor(COLOR.texto)
                    .text(valor, MARGEN_X +
                    ANCHO_ETIQUETA, y, {
                    width: anchoValor,
                });
                y +=
                    alto +
                        6;
            }
            y +=
                6;
        };
        const parrafo = (texto, color = COLOR.texto, tamano = 9.5) => {
            doc
                .font("Helvetica")
                .fontSize(tamano);
            const opciones = {
                width: ANCHO,
                lineGap: 1.5,
            };
            const alto = doc.heightOfString(texto, opciones);
            espacio(alto +
                4);
            doc
                .fillColor(color)
                .text(texto, MARGEN_X, y, opciones);
            y +=
                alto +
                    10;
        };
        const vinetas = (items) => {
            for (const item of items) {
                doc
                    .font("Helvetica")
                    .fontSize(9.5);
                const opciones = {
                    width: ANCHO -
                        14,
                    lineGap: 1.5,
                };
                const alto = doc.heightOfString(item, opciones);
                espacio(alto +
                    5);
                doc
                    .fillColor(COLOR.banda)
                    .text("•", MARGEN_X + 2, y);
                doc
                    .fillColor(COLOR.texto)
                    .text(item, MARGEN_X + 14, y, opciones);
                y +=
                    alto +
                        5;
            }
            y +=
                6;
        };
        /* ---------- Contenido ---------- */
        seccion("Datos del firmante");
        filas(datos.firmante);
        seccion("Registro de la firma");
        filas(datos.registro);
        if (datos.declaraciones.length >
            0) {
            seccion("Declaraciones aceptadas");
            vinetas(datos.declaraciones);
        }
        if (datos.autorizaciones.length >
            0) {
            seccion("Autorizaciones opcionales");
            filas(datos.autorizaciones);
            parrafo(datos.notaAutorizaciones, COLOR.suave, 8.5);
        }
        seccion("Plazo de conservación");
        parrafo(datos.conservacion);
        seccion("Tus derechos");
        parrafo(datos.derechos);
        /* ---------- Pie en cada página ---------- */
        const rango = doc.bufferedPageRange();
        for (let i = 0; i < rango.count; i++) {
            doc.switchToPage(rango.start +
                i);
            const yPie = PAGINA.alto -
                ALTO_PIE +
                10;
            doc
                .moveTo(MARGEN_X, yPie)
                .lineTo(MARGEN_X +
                ANCHO, yPie)
                .lineWidth(0.6)
                .strokeColor(COLOR.linea)
                .stroke();
            doc
                .font("Helvetica")
                .fontSize(7.5)
                .fillColor(COLOR.suave)
                .text(datos.pie, MARGEN_X, yPie + 6, {
                width: ANCHO -
                    70,
                lineGap: 1,
            });
            doc.text(`Página ${i + 1} de ${rango.count}`, MARGEN_X +
                ANCHO -
                70, yPie + 6, {
                width: 70,
                align: "right",
            });
        }
        doc.end();
    });
}
/* =========================================================
   ENVIAR COMPROBANTE
   ========================================================= */
export async function enviarComprobanteFirma(consentimientoId) {
    const startedAt = Date.now();
    let email = null;
    let evidenciaPath = null;
    let encontrado = false;
    try {
        const consentimiento = await prisma
            .consentimientoDatos
            .findUnique({
            where: {
                id: consentimientoId,
            },
            select: {
                id: true,
                campaniaId: true,
                empresaId: true,
                nombre: true,
                email: true,
                empresaNombre: true,
                estado: true,
                fechaRespuesta: true,
                versionDocumento: true,
                documentoHash: true,
                respuestaJson: true,
                ipRespuesta: true,
                userAgent: true,
                campania: {
                    select: {
                        tituloDocumento: true,
                        empresaId: true,
                        configuracionConsentimiento: true,
                    },
                },
            },
        });
        if (!consentimiento) {
            console.warn(`${LOG} ⚠️ Consentimiento no encontrado`, {
                consentimientoId,
            });
            return;
        }
        encontrado =
            true;
        email =
            consentimiento.email;
        if (consentimiento.estado !==
            EstadoConsentimientoDatos.ACEPTADO ||
            !consentimiento.fechaRespuesta) {
            return;
        }
        /* Un solo comprobante por consentimiento */
        const previo = await prisma
            .consentimientoDatosEvento
            .findFirst({
            where: {
                consentimientoId: consentimiento.id,
                tipo: TipoEventoConsentimientoDatos.COMPROBANTE_ENVIADO,
            },
            select: {
                id: true,
            },
        });
        if (previo) {
            console.log(`${LOG} ya enviado, se omite`, {
                consentimientoId,
            });
            return;
        }
        /* ---------- Empresa ---------- */
        const empresaId = consentimiento.empresaId ??
            consentimiento.campania.empresaId;
        const empresa = empresaId
            ? await prisma
                .empresa
                .findUnique({
                where: {
                    id_empresa: empresaId,
                },
                select: {
                    nombre: true,
                    razonSocial: true,
                    leypdFicha: {
                        select: {
                            datos: true,
                        },
                    },
                },
            })
            : null;
        const empresaNombre = empresa?.nombre ??
            consentimiento.empresaNombre ??
            "Asesorías RIDS";
        const empresaLegal = empresa?.razonSocial?.trim() ||
            empresaNombre;
        const correoDerechos = correoDerechosEmpresa(empresa?.leypdFicha?.datos);
        /* ---------- Formulario y respuestas ---------- */
        const configuracion = consentimiento
            .campania
            .configuracionConsentimiento;
        const campos = Array.isArray(configuracion?.campos)
            ? configuracion.campos
            : [];
        const respuestaJson = consentimiento.respuestaJson;
        const respuestas = esObjeto(respuestaJson) &&
            esObjeto(respuestaJson.respuestas)
            ? respuestaJson.respuestas
            : {};
        const clasificacion = clasificar(campos, respuestas);
        const documento = documentosFirmados(campos, consentimiento.campania.tituloDocumento);
        /* ---------- Folio y código ---------- */
        const fecha = consentimiento.fechaRespuesta;
        const folio = folioComprobante(consentimiento.id);
        const codigo = codigoVerificacion({
            consentimientoId: consentimiento.id,
            email: consentimiento.email,
            fechaRespuesta: fecha,
            documentoHash: consentimiento.documentoHash,
        });
        /* ---------- PDF ---------- */
        const firmante = [
            ...(clasificacion.firmante.length ===
                0 &&
                consentimiento.nombre
                ? [
                    {
                        etiqueta: "Nombre",
                        valor: consentimiento.nombre,
                    },
                ]
                : []),
            ...clasificacion.firmante,
            {
                etiqueta: "Correo",
                valor: consentimiento.email,
            },
            {
                etiqueta: "Empresa",
                valor: empresaLegal,
            },
        ];
        const registro = [
            {
                etiqueta: "Fecha",
                valor: fechaLarga(fecha),
            },
            {
                etiqueta: "Hora",
                valor: `${horaChile(fecha, true)} (hora de Chile)`,
            },
            {
                etiqueta: "Documento firmado",
                valor: documento,
            },
            {
                etiqueta: "Versión",
                valor: consentimiento.versionDocumento,
            },
            {
                etiqueta: "Huella del documento (SHA-256)",
                valor: consentimiento.documentoHash,
                mono: true,
            },
            {
                etiqueta: "Medio",
                valor: `Formulario web con enlace personal enviado a ${consentimiento.email}`,
            },
            {
                etiqueta: "Dirección IP",
                valor: consentimiento.ipRespuesta ??
                    "",
            },
            {
                etiqueta: "Navegador",
                valor: (consentimiento.userAgent ??
                    "").slice(0, 200),
            },
            {
                etiqueta: "Folio",
                valor: folio,
            },
            {
                etiqueta: "Código de verificación",
                valor: codigo,
                mono: true,
            },
        ];
        const pdf = await generarPdfComprobante({
            empresa: empresaNombre,
            tituloFormulario: configuracion?.tituloFormulario?.trim() ||
                consentimiento.campania.tituloDocumento,
            firmante,
            registro,
            declaraciones: clasificacion.declaraciones,
            autorizaciones: clasificacion.autorizaciones,
            notaAutorizaciones: `Las autorizaciones opcionales no condicionan tu relación con ${empresaNombre}. Puedes cambiarlas o retirarlas cuando quieras escribiendo a ${correoDerechos}.`,
            conservacion: `${empresaNombre} conserva este comprobante y el registro de tu firma como respaldo del consentimiento mientras esté vigente y, una vez revocado o terminado, solo por el plazo necesario para acreditar su cumplimiento o atender obligaciones legales.`,
            derechos: `Puedes ejercer tus derechos de acceso, rectificación, supresión, oposición, portabilidad y bloqueo de tus datos personales (Ley N° 21.719), y revocar este consentimiento, escribiendo a ${correoDerechos}.`,
            pie: `Registro de aceptación mediante firma electrónica simple, conforme a la Ley N° 19.799 sobre documentos electrónicos y firma electrónica. Folio ${folio} · Código de verificación ${codigo}.`,
        });
        const sha256 = createHash("sha256")
            .update(pdf)
            .digest("hex");
        const archivo = `Comprobante_Firma_${slug(empresaNombre, "empresa")}_${slug(consentimiento.nombre ?? consentimiento.email.split("@")[0] ?? "", "firmante")}.pdf`;
        /* ---------- Supabase ---------- */
        const ruta = `comprobantes/${consentimiento.campaniaId}/${folio}-${archivo}`;
        const { error: errorSubida, } = await supabaseAdmin
            .storage
            .from(PROTECCION_DATOS_DOCUMENTOS_BUCKET)
            .upload(ruta, pdf, {
            contentType: "application/pdf",
            upsert: true,
        });
        if (errorSubida) {
            throw new Error(`Supabase: ${errorSubida.message}`);
        }
        evidenciaPath =
            ruta;
        await prisma
            .consentimientoDatos
            .update({
            where: {
                id: consentimiento.id,
            },
            data: {
                evidenciaPath: ruta,
            },
        });
        /* ---------- Correo ---------- */
        const primerNombre = consentimiento.nombre
            ?.trim()
            .split(/\s+/)[0] ??
            "";
        const bodyHtml = `
<div style="font-family:Arial,sans-serif;font-size:14px;line-height:1.55;color:#1E293B;">
    <p style="margin:0 0 12px;">Hola${primerNombre ? ` ${escaparHtml(primerNombre)}` : ""}:</p>
    <p style="margin:0 0 12px;">Adjuntamos el comprobante de tu firma de <strong>${escaparHtml(documento)}</strong>, registrada el ${escaparHtml(fechaLarga(fecha))} a las ${escaparHtml(horaChile(fecha, false))}.</p>
    <p style="margin:0 0 12px;">Guárdalo como respaldo. Folio <strong>${folio}</strong> · código de verificación <strong>${codigo}</strong>.</p>
    <p style="margin:0 0 12px;">Para ejercer tus derechos sobre tus datos escribe a <a href="mailto:${escaparHtml(correoDerechos)}">${escaparHtml(correoDerechos)}</a>.</p>
    <p style="margin:16px 0 0;font-size:12px;color:#64748B;">Mensaje automático enviado por ${escaparHtml(empresaNombre)} con apoyo de Asesorías RIDS.</p>
</div>
            `.trim();
        await sendEmail({
            to: consentimiento.email,
            subject: `Comprobante de firma · ${empresaNombre}`,
            bodyHtml,
            replyTo: correoDerechos,
            attachments: [
                {
                    name: archivo,
                    contentType: "application/pdf",
                    contentBytes: pdf.toString("base64"),
                },
            ],
        });
        /* ---------- Evento ---------- */
        await prisma
            .consentimientoDatosEvento
            .create({
            data: {
                consentimientoId: consentimiento.id,
                tipo: TipoEventoConsentimientoDatos.COMPROBANTE_ENVIADO,
                detalle: toPrismaJson({
                    email: consentimiento.email,
                    folio,
                    codigo,
                    sha256,
                    bytes: pdf.length,
                    evidenciaPath: ruta,
                    fechaRespuesta: fecha.toISOString(),
                }),
            },
        });
        console.log(`${LOG} ✅ Enviado`, {
            consentimientoId,
            email: consentimiento.email,
            folio,
            kb: Math.round(pdf.length /
                1024),
            durationMs: Date.now() -
                startedAt,
        });
    }
    catch (error) {
        const detalle = error instanceof Error
            ? error.message
            : "Error desconocido";
        console.error(`${LOG} ❌ Error`, {
            consentimientoId,
            email,
            error: detalle,
        });
        if (!encontrado) {
            return;
        }
        try {
            await prisma
                .consentimientoDatosEvento
                .create({
                data: {
                    consentimientoId,
                    tipo: TipoEventoConsentimientoDatos.ERROR_ENVIO,
                    detalle: toPrismaJson({
                        comprobante: true,
                        email,
                        evidenciaPath,
                        error: detalle,
                    }),
                },
            });
        }
        catch (errorEvento) {
            console.error(`${LOG} ❌ No se pudo registrar el error`, errorEvento instanceof Error
                ? errorEvento.message
                : errorEvento);
        }
    }
}
//# sourceMappingURL=proteccion-datos-comprobante.service.js.map