// src/service/leypd/leypd-ficha-pdf.service.ts
//
// PDF interno (RIDS) de la ficha Ley PD de una empresa: las 24 preguntas con su
// respuesta, estado y fuente, y qué elementos quedan con datos pendientes.
// Mismo estilo que el PDF de la ficha de empresa (PDFKit).
//
// Estados de cada pregunta (misma regla que el worker al generar los documentos):
//   COMPLETO    respuesta guardada en la ficha (RIDS, portal o enlace del cliente)
//   DESDE_CRM   sin respuesta, pero el worker usa el dato del CRM (razón social, RUT…)
//   SUGERIDO    sugerencia del CRM que el worker NO usa (responsables): falta confirmarla
//   EN_PROCESO  respuesta que empieza con «En proceso»: el documento la deja pendiente
//   FALTA       sin respuesta
// Las preguntas condicionales (rubro salud, servicios de personal, venta en línea) se
// muestran aparte y no cuentan en el avance mientras no exista la aplicabilidad.
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import PDFDocument from "pdfkit";
import { FICHA_LEYPD_GRUPOS, } from "./leypd-ficha-campos.js";
import { LEYPD_ELEMENTOS, formatearNumeroLeypd, } from "./leypd-catalogo.js";
import { obtenerFichaLeypdInterna, } from "./leypd-ficha.service.js";
import { esValorVacio, } from "./leypd-ficha-validacion.js";
/* =========================================================
   REGLAS
========================================================= */
/**
 * Preguntas que el worker completa con el CRM aunque no estén en la ficha
 * (leypd/ficha.py → desde_crm). Los responsables y el correo de privacidad
 * NO: solo valen si constan en la ficha Ley PD.
 */
const USADOS_DESDE_CRM_POR_WORKER = new Set([
    "razonSocial",
    "rut",
    "domicilioLegal",
    "contactoOficialEmpresa",
    "sitioWeb",
    "hostingProveedor",
    "sistemasConUsuarioContrasena",
]);
const ESTADOS_RESUELTOS = new Set(["COMPLETO", "DESDE_CRM"]);
const CONDICION_TEXTO = {
    RUBRO_SALUD: "Solo si la empresa es del rubro salud",
    EMPRESA_PERSONAS: "Solo si la empresa provee servicios de personal",
    VENTA_ONLINE: "Solo si la empresa vende por su sitio web",
};
const FUENTE_TEXTO = {
    RIDS: "RIDS (CRM)",
    CLIENTE_PORTAL: "Cliente (portal)",
    ENLACE_PUBLICO: "Cliente (enlace)",
    CRM: "Sugerencia del CRM",
};
/* =========================================================
   ESTILO
========================================================= */
const COLOR = {
    primario: "#0e7490",
    primarioSuave: "#ecfeff",
    texto: "#0f172a",
    suave: "#64748b",
    borde: "#cbd5e1",
    filaPar: "#f8fafc",
    verde: "#047857",
    azul: "#1d4ed8",
    ambar: "#b45309",
    rojo: "#b91c1c",
};
const ESTADO = {
    COMPLETO: { texto: "Completo", color: COLOR.verde },
    DESDE_CRM: { texto: "Dato del CRM", color: COLOR.azul },
    SUGERIDO: { texto: "Por confirmar", color: COLOR.ambar },
    EN_PROCESO: { texto: "En proceso", color: COLOR.ambar },
    FALTA: { texto: "Falta", color: COLOR.rojo },
};
/* =========================================================
   LOGO (mismas rutas que el PDF de la ficha de empresa)
========================================================= */
const RUTAS_LOGO = [
    path.resolve(process.cwd(), "src", "assets", "logo-rids.png"),
    path.resolve(process.cwd(), "assets", "logo-rids.png"),
];
let logoCache;
function logoRids() {
    if (logoCache === undefined) {
        const ruta = RUTAS_LOGO.find((r) => existsSync(r));
        logoCache = ruta ? readFileSync(ruta) : null;
    }
    return logoCache;
}
/* =========================================================
   FORMATO
========================================================= */
const fechaChile = (d, conHora = false) => new Intl.DateTimeFormat("es-CL", {
    timeZone: "America/Santiago",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    ...(conHora ? { hour: "2-digit", minute: "2-digit", hour12: false } : {}),
}).format(d);
/** "2026-11-16" o ISO → "16-11-2026" (sin convertir zona: es una fecha, no un instante). */
function fechaSimple(valor) {
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(valor);
    return m ? `${m[3]}-${m[2]}-${m[1]}` : valor;
}
function etiquetaOpcion(campo, v) {
    return campo.opciones?.find((o) => o.value === v)?.label ?? String(v);
}
function valorTexto(campo, valor) {
    if (esValorVacio(valor))
        return null;
    if (typeof valor === "boolean")
        return valor ? "Sí" : "No";
    if (Array.isArray(valor))
        return valor.map((v) => etiquetaOpcion(campo, v)).join(", ");
    if (campo.tipo === "select")
        return etiquetaOpcion(campo, valor);
    if (campo.tipo === "date" && typeof valor === "string")
        return fechaSimple(valor);
    return String(valor).trim();
}
function fuenteTexto(meta) {
    if (!meta)
        return null;
    const fecha = meta.fecha ? new Date(meta.fecha) : null;
    return [
        FUENTE_TEXTO[meta.fuente] ?? meta.fuente,
        meta.actualizadoPor,
        fecha && !Number.isNaN(fecha.getTime()) ? fechaChile(fecha) : null,
    ].filter(Boolean).join(" · ") || null;
}
function nombreArchivoSeguro(nombre) {
    return nombre
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[^a-zA-Z0-9]+/g, "_")
        .replace(/^_+|_+$/g, "")
        .slice(0, 60) || "empresa";
}
const listaElementos = (numeros) => numeros.map(formatearNumeroLeypd).join(", ");
/* =========================================================
   EVALUAR
========================================================= */
function evaluarCampo(campo, meta) {
    const valor = valorTexto(campo, meta?.valor);
    const fuente = fuenteTexto(meta);
    let estado;
    if (valor === null) {
        estado = "FALTA";
    }
    else if (meta?.fuente === "CRM") {
        estado = USADOS_DESDE_CRM_POR_WORKER.has(campo.key) ? "DESDE_CRM" : "SUGERIDO";
    }
    else if (valor.toLowerCase().startsWith("en proceso")) {
        estado = "EN_PROCESO";
    }
    else {
        estado = "COMPLETO";
    }
    return { campo, estado, valor, fuente };
}
/* =========================================================
   GENERAR
========================================================= */
export async function generarFichaLeypdPdf(empresaId, generadoPor) {
    /* Lanza EMPRESA_NO_ENCONTRADA si no existe */
    const { empresa, ficha, campos } = await obtenerFichaLeypdInterna(empresaId);
    const evaluados = [...campos]
        .sort((a, b) => a.numero - b.numero)
        .map((campo) => evaluarCampo(campo, ficha.datos[campo.key]));
    const buffer = await construirPdf({ empresa, ficha, evaluados, generadoPor: generadoPor ?? null });
    const hoy = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Santiago" }).format(new Date());
    return {
        buffer,
        nombreArchivo: `Ficha_LeyPD_${nombreArchivoSeguro(empresa.nombre)}_${hoy}.pdf`,
    };
}
function construirPdf({ empresa, ficha, evaluados, generadoPor }) {
    return new Promise((resolve, reject) => {
        const doc = new PDFDocument({
            size: "A4",
            margins: { top: 50, right: 45, bottom: 55, left: 45 },
            bufferPages: true,
            info: {
                Title: `Ficha Ley PD ${empresa.nombre}`,
                Subject: "Datos del cliente para la documentación Ley 21.719",
                Author: "RIDS",
            },
        });
        const chunks = [];
        doc.on("data", (c) => chunks.push(c));
        doc.on("end", () => resolve(Buffer.concat(chunks)));
        doc.on("error", reject);
        const izquierda = doc.page.margins.left;
        const ancho = doc.page.width - doc.page.margins.left - doc.page.margins.right;
        const limiteInferior = () => doc.page.height - doc.page.margins.bottom;
        const asegurarEspacio = (alto) => {
            if (doc.y + alto > limiteInferior())
                doc.addPage();
        };
        /* ---------------- conteos ---------------- */
        const base = evaluados.filter((e) => !e.campo.condicion);
        const condicionales = evaluados.filter((e) => e.campo.condicion);
        const resueltos = base.filter((e) => ESTADOS_RESUELTOS.has(e.estado));
        const obligatoriosPendientes = base.filter((e) => e.campo.obligatorio && !ESTADOS_RESUELTOS.has(e.estado));
        const porConfirmar = base.filter((e) => e.estado === "SUGERIDO" || e.estado === "EN_PROCESO");
        const porcentaje = base.length ? Math.round((resueltos.length / base.length) * 100) : 0;
        /* ---------------- helpers de dibujo ---------------- */
        function tituloSeccion(titulo, derecha) {
            asegurarEspacio(110);
            doc.moveDown(0.6);
            const y = doc.y;
            doc.rect(izquierda, y, ancho, 24).fill(COLOR.primario);
            doc.fillColor("#ffffff").font("Helvetica-Bold").fontSize(12)
                .text(titulo, izquierda + 10, y + 6, { width: ancho - 130, lineBreak: false });
            if (derecha) {
                doc.font("Helvetica").fontSize(9)
                    .text(derecha, izquierda + ancho - 120, y + 8, { width: 110, align: "right", lineBreak: false });
            }
            doc.y = y + 32;
            doc.x = izquierda;
        }
        function tabla(encabezados, filas, anchos) {
            const total = anchos.reduce((a, b) => a + b, 0);
            const cols = anchos.map((a) => (a / total) * ancho);
            const pad = 4;
            const alto = (celdas, fuente, tam) => {
                doc.font(fuente).fontSize(tam);
                return Math.max(...celdas.map((c, i) => doc.heightOfString(c.t, { width: (cols[i] ?? 0) - pad * 2 }))) + pad * 2;
            };
            const encabezado = (siguiente) => {
                const h = alto(encabezados.map((t) => ({ t })), "Helvetica-Bold", 8);
                asegurarEspacio(h + siguiente);
                const y = doc.y;
                doc.rect(izquierda, y, ancho, h).fill(COLOR.primarioSuave);
                let x = izquierda;
                encabezados.forEach((t, i) => {
                    doc.fillColor(COLOR.primario).font("Helvetica-Bold").fontSize(8)
                        .text(t, x + pad, y + pad, { width: (cols[i] ?? 0) - pad * 2 });
                    x += cols[i] ?? 0;
                });
                doc.y = y + h;
            };
            encabezado(filas[0] ? alto(filas[0], "Helvetica", 8.5) : 20);
            filas.forEach((fila, n) => {
                const h = alto(fila, "Helvetica", 8.5);
                if (doc.y + h > limiteInferior()) {
                    doc.addPage();
                    encabezado(h);
                }
                const y = doc.y;
                if (n % 2 === 1)
                    doc.rect(izquierda, y, ancho, h).fill(COLOR.filaPar);
                let x = izquierda;
                fila.forEach((c, i) => {
                    doc.fillColor(c.color ?? COLOR.texto).font(c.bold ? "Helvetica-Bold" : "Helvetica").fontSize(8.5)
                        .text(c.t, x + pad, y + pad, { width: (cols[i] ?? 0) - pad * 2 });
                    x += cols[i] ?? 0;
                });
                doc.moveTo(izquierda, y + h).lineTo(izquierda + ancho, y + h)
                    .lineWidth(0.5).strokeColor(COLOR.borde).stroke();
                doc.y = y + h;
            });
            doc.x = izquierda;
            doc.moveDown(0.6);
        }
        /** Una pregunta: número y texto, estado a la derecha, detalle, respuesta y fuente. */
        function bloqueCampo(e) {
            const { campo, estado, valor, fuente } = e;
            const est = ESTADO[estado];
            const xTexto = izquierda + 10;
            const anchoTexto = ancho - 10;
            const anchoTitulo = anchoTexto - 95;
            const titulo = `${campo.numero}. ${campo.label}`;
            const detalle = [
                campo.obligatorio ? "Obligatorio" : "Opcional",
                `Elementos ${listaElementos(campo.elementos)}`,
                campo.condicion ? CONDICION_TEXTO[campo.condicion] : null,
            ].filter(Boolean).join(" · ");
            const respuesta = valor ?? "Sin respuesta";
            const pie = fuente
                ? `Fuente: ${fuente}`
                : null;
            doc.font("Helvetica-Bold").fontSize(9.5);
            const hTitulo = doc.heightOfString(titulo, { width: anchoTitulo });
            doc.font("Helvetica").fontSize(7.5);
            const hDetalle = doc.heightOfString(detalle, { width: anchoTexto });
            doc.font(valor ? "Helvetica" : "Helvetica-Oblique").fontSize(9);
            const hRespuesta = doc.heightOfString(respuesta, { width: anchoTexto });
            doc.font("Helvetica").fontSize(7.5);
            const hPie = pie ? doc.heightOfString(pie, { width: anchoTexto }) + 2 : 0;
            const altoTotal = hTitulo + 2 + hDetalle + 4 + hRespuesta + 3 + hPie + 8;
            /* Una respuesta muy larga puede cortar página; el resto queda junto */
            asegurarEspacio(Math.min(altoTotal, 160));
            const y0 = doc.y;
            doc.fillColor(COLOR.texto).font("Helvetica-Bold").fontSize(9.5)
                .text(titulo, xTexto, y0, { width: anchoTitulo });
            /* Etiqueta de estado */
            doc.font("Helvetica-Bold").fontSize(7.5);
            const anchoEtiqueta = doc.widthOfString(est.texto) + 12;
            doc.roundedRect(izquierda + ancho - anchoEtiqueta, y0 - 1, anchoEtiqueta, 13, 6.5)
                .lineWidth(0.8).strokeColor(est.color).stroke();
            doc.fillColor(est.color)
                .text(est.texto, izquierda + ancho - anchoEtiqueta, y0 + 2, { width: anchoEtiqueta, align: "center", lineBreak: false });
            doc.fillColor(COLOR.suave).font("Helvetica").fontSize(7.5)
                .text(detalle, xTexto, y0 + hTitulo + 2, { width: anchoTexto });
            doc.fillColor(valor ? COLOR.texto : COLOR.rojo).font(valor ? "Helvetica" : "Helvetica-Oblique").fontSize(9)
                .text(respuesta, xTexto, doc.y + 4, { width: anchoTexto });
            if (pie) {
                doc.fillColor(COLOR.suave).font("Helvetica").fontSize(7.5)
                    .text(pie, xTexto, doc.y + 3, { width: anchoTexto });
            }
            const y1 = doc.y + 6;
            /* Barra de color a la izquierda (si el bloque no cortó página) */
            if (y1 > y0) {
                doc.rect(izquierda, y0 - 2, 3, y1 - y0 - 2).fill(est.color);
            }
            doc.moveTo(izquierda, y1).lineTo(izquierda + ancho, y1)
                .lineWidth(0.5).strokeColor(COLOR.borde).stroke();
            doc.y = y1 + 6;
            doc.x = izquierda;
        }
        /* ================================================================
           PORTADA + RESUMEN
        ================================================================ */
        const logo = logoRids();
        const anchoTitulo = logo ? ancho - 150 : ancho;
        if (logo) {
            doc.image(logo, izquierda + ancho - 130, doc.page.margins.top - 8, { fit: [130, 50], align: "right" });
        }
        doc.fillColor(COLOR.primario).font("Helvetica-Bold").fontSize(9)
            .text("ASESORÍAS RIDS · LEY 21.719 · DATOS DEL CLIENTE", izquierda, doc.y, { width: anchoTitulo });
        doc.moveDown(0.3);
        doc.fillColor(COLOR.texto).font("Helvetica-Bold").fontSize(22)
            .text(empresa.nombre, { width: anchoTitulo });
        if (empresa.razonSocial && empresa.razonSocial !== empresa.nombre) {
            doc.fillColor(COLOR.suave).font("Helvetica").fontSize(11)
                .text(empresa.razonSocial, { width: anchoTitulo });
        }
        doc.moveDown(0.3);
        doc.fillColor(COLOR.suave).font("Helvetica").fontSize(9)
            .text([`Generado el ${fechaChile(new Date(), true)}`, generadoPor ? `por ${generadoPor}` : null]
            .filter(Boolean).join(" "), { width: ancho });
        /* Estado de la ficha (respuesta del cliente / enlace) */
        const estadoFicha = ficha.respondidoAt
            ? `Ficha enviada por ${ficha.respondidoPor ?? "el cliente"} el ${fechaChile(ficha.respondidoAt, true)}.`
            : ficha.enlaceCreadoAt && !ficha.tokenRevokedAt
                ? `Enlace enviado al cliente el ${fechaChile(ficha.enlaceCreadoAt)}` +
                    (ficha.tokenExpiresAt ? `, vence el ${fechaChile(ficha.tokenExpiresAt)}` : "") +
                    ". Aún no la envía."
                : "Sin enlace vigente para el cliente.";
        doc.fillColor(COLOR.suave).font("Helvetica").fontSize(9).text(estadoFicha, { width: ancho });
        /* Recuadro de avance */
        doc.moveDown(0.8);
        const yBox = doc.y;
        const colorAvance = porcentaje >= 80 ? COLOR.verde : porcentaje >= 50 ? COLOR.ambar : COLOR.rojo;
        doc.roundedRect(izquierda, yBox, ancho, 62, 6).lineWidth(1).strokeColor(COLOR.borde).stroke();
        doc.fillColor(colorAvance).font("Helvetica-Bold").fontSize(28)
            .text(`${porcentaje}%`, izquierda + 14, yBox + 14, { width: 110 });
        doc.fillColor(COLOR.texto).font("Helvetica-Bold").fontSize(11)
            .text(obligatoriosPendientes.length === 0 ? "Datos obligatorios completos" : "Faltan datos para completar los documentos", izquierda + 130, yBox + 12, { width: ancho - 145 });
        doc.fillColor(COLOR.suave).font("Helvetica").fontSize(9)
            .text(`${resueltos.length} de ${base.length} preguntas resueltas · ` +
            `${obligatoriosPendientes.length} obligatoria(s) pendiente(s) · ` +
            `${porConfirmar.length} por confirmar · ` +
            `${condicionales.length} condicional(es) aparte`, izquierda + 130, doc.y + 2, { width: ancho - 145 });
        doc.y = yBox + 74;
        doc.x = izquierda;
        /* Leyenda */
        doc.fillColor(COLOR.suave).font("Helvetica").fontSize(7.5).text("Completo: respondido en la ficha. Dato del CRM: el documento usa lo registrado en el CRM. " +
            "Por confirmar: sugerencia del CRM o respuesta «en proceso»; el documento lo deja pendiente. " +
            "Falta: sin respuesta.", izquierda, doc.y, { width: ancho });
        /* Pendientes por elemento */
        tituloSeccion("Datos pendientes por elemento");
        tabla(["Elemento", "Datos pendientes de la ficha"], LEYPD_ELEMENTOS.map((el) => {
            const usan = evaluados.filter((e) => e.campo.elementos.includes(el.numero));
            const pendientes = usan.filter((e) => !ESTADOS_RESUELTOS.has(e.estado));
            const nombre = { t: `${el.codigo} · ${el.titulo}` };
            if (usan.length === 0) {
                return [nombre, { t: "No usa datos de la ficha", color: COLOR.suave }];
            }
            if (pendientes.length === 0) {
                return [nombre, { t: "Completo", color: COLOR.verde, bold: true }];
            }
            const soloCondicionales = pendientes.every((e) => e.campo.condicion);
            return [
                nombre,
                {
                    t: pendientes
                        .map((e) => `${e.campo.numero}. ${e.campo.label}${e.campo.condicion ? " (si aplica)" : ""}`)
                        .join("\n"),
                    color: soloCondicionales ? COLOR.suave : COLOR.rojo,
                },
            ];
        }), [36, 64]);
        /* ================================================================
           PREGUNTAS POR GRUPO
        ================================================================ */
        for (const grupo of [...FICHA_LEYPD_GRUPOS].sort((a, b) => a.orden - b.orden)) {
            const delGrupo = evaluados.filter((e) => e.campo.grupo === grupo.key);
            if (delGrupo.length === 0)
                continue;
            const baseGrupo = delGrupo.filter((e) => !e.campo.condicion);
            const listos = baseGrupo.filter((e) => ESTADOS_RESUELTOS.has(e.estado)).length;
            tituloSeccion(`${grupo.orden}. ${grupo.titulo}`, `${listos} / ${baseGrupo.length} resueltas`);
            for (const e of delGrupo) {
                bloqueCampo(e);
            }
        }
        /* ================================================================
           PIE DE PÁGINA
        ================================================================ */
        const rango = doc.bufferedPageRange();
        for (let i = rango.start; i < rango.start + rango.count; i++) {
            doc.switchToPage(i);
            const margenInferior = doc.page.margins.bottom;
            doc.page.margins.bottom = 0;
            const y = doc.page.height - 35;
            doc.moveTo(izquierda, y - 6).lineTo(izquierda + ancho, y - 6)
                .lineWidth(0.5).strokeColor(COLOR.borde).stroke();
            doc.fillColor(COLOR.suave).font("Helvetica").fontSize(7.5)
                .text(`${empresa.nombre} · Ficha Ley PD · Uso interno RIDS`, izquierda, y, {
                width: ancho - 100,
                lineBreak: false,
            });
            doc.text(`Página ${i - rango.start + 1} de ${rango.count}`, izquierda + ancho - 90, y, {
                width: 90,
                align: "right",
                lineBreak: false,
            });
            doc.page.margins.bottom = margenInferior;
        }
        doc.end();
    });
}
//# sourceMappingURL=leypd-ficha-pdf.service.js.map