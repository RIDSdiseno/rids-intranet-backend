// src/service/leypd/leypd-expediente-pdf.service.ts
//
// Expediente Ley PD (uso interno RIDS): un solo PDF con
//   1. portada (logos, empresa, fecha, quién lo generó),
//   2. estado de los 13 elementos (LeypdElemento),
//   3. índice con la página de cada documento,
//   4. los documentos que generó el worker (LeypdDocumentoGenerado), en su
//      versión ACTUAL de SharePoint (incluye los editados a mano), ordenados
//      por elemento. Word se convierte con Graph (?format=pdf); PDF se usa tal cual.
// Excel y otros formatos no se incluyen: aparecen en el índice como «ver en SharePoint».
// Si un documento falla (borrado, sin permisos, no convertible) el expediente se
// genera igual y el índice indica el motivo.
// Se genera al momento y no se guarda en ningún lado.
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import PDFDocument from "pdfkit";
import { PDFDocument as PdfLib, StandardFonts, rgb } from "pdf-lib";
import { prisma } from "../../lib/prisma.js";
import { descargarArchivoComoPdf } from "../../ms/sharepoint.js";
import { logoEmpresaPngParaPdf } from "../empresas/empresa-logo.service.js";
import { LEYPD_ELEMENTOS, formatearNumeroLeypd } from "./leypd-catalogo.js";
import { obtenerDetalleLeypdEmpresa } from "./leypd.service.js";
/* =========================================================
   CONFIG
========================================================= */
const DESCARGAS_EN_PARALELO = 4;
const EXT_PDF = new Set(["pdf"]);
const EXT_CONVERTIBLE = new Set(["docx", "doc", "rtf", "odt", "pptx", "ppt"]);
const EXT_EXCEL = new Set(["xlsx", "xls", "xlsm", "csv"]);
/** Una generación a la vez por empresa (es pesada: Graph + memoria). */
const enCurso = new Set();
/* =========================================================
   ESTILO (mismo que el PDF de la ficha Ley PD)
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
    IMPLEMENTADO: { texto: "Implementado", color: COLOR.verde },
    NO_APLICA: { texto: "No aplica", color: COLOR.azul },
    EN_PROGRESO: { texto: "En progreso", color: COLOR.ambar },
    NO_INICIADO: { texto: "Sin iniciar", color: COLOR.rojo },
};
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
const fechaHoraChile = (d) => new Intl.DateTimeFormat("es-CL", {
    timeZone: "America/Santiago",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
}).format(d);
/** Campos @db.Date: vienen a las 00:00 UTC, se formatean en UTC para no correr el día. */
const fechaDia = (d) => new Intl.DateTimeFormat("es-CL", {
    timeZone: "UTC",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
}).format(d);
function nombreArchivoSeguro(nombre) {
    return nombre
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[^a-zA-Z0-9]+/g, "_")
        .replace(/^_+|_+$/g, "")
        .slice(0, 60) || "empresa";
}
/** Texto seguro para la fuente estándar de pdf-lib (WinAnsi). */
function textoWinAnsi(valor) {
    return valor.replace(/[^\x20-\x7E -ÿ]/g, "");
}
function extension(nombre) {
    const punto = nombre.lastIndexOf(".");
    return punto === -1 ? "" : nombre.slice(punto + 1).toLowerCase();
}
function numeroElemento(ruta) {
    const m = /^(\d{1,2})\s/.exec(ruta.split("/")[0] ?? "");
    if (!m)
        return null;
    const n = Number(m[1]);
    return LEYPD_ELEMENTOS.some((e) => e.numero === n) ? n : null;
}
function motivoError(error) {
    const msg = error instanceof Error ? error.message : "";
    const nombre = error instanceof Error ? error.name : "";
    if (msg === "SHAREPOINT_NO_ENCONTRADO")
        return "No está en SharePoint (borrado o movido)";
    if (msg === "SHAREPOINT_SIN_PERMISOS")
        return "Sin permisos en SharePoint";
    if (nombre === "TimeoutError" || nombre === "AbortError")
        return "SharePoint no respondió a tiempo";
    if (msg === "PDF_SIN_PAGINAS")
        return "El PDF no tiene páginas";
    return "No se pudo convertir a PDF";
}
/* =========================================================
   DOCUMENTOS
========================================================= */
function prepararDocumentos(registros) {
    return registros
        .map((r) => {
        const ext = extension(r.ruta);
        const modo = EXT_PDF.has(ext) ? "PDF" : EXT_CONVERTIBLE.has(ext) ? "CONVERTIR" : null;
        return {
            ruta: r.ruta,
            itemId: r.itemId,
            /* Sin la carpeta del elemento; conserva subcarpetas (p. ej. "Banner/banner.js") */
            nombre: r.ruta.split("/").slice(1).join("/") || r.ruta,
            numero: numeroElemento(r.ruta),
            modo,
            pdf: null,
            paginas: 0,
            paginaInicio: null,
            motivo: modo !== null
                ? null
                : EXT_EXCEL.has(ext)
                    ? "Excel: ver en SharePoint"
                    : `Formato .${ext || "?"}: ver en SharePoint`,
        };
    })
        .sort((a, b) => (a.numero ?? 99) - (b.numero ?? 99) ||
        a.ruta.localeCompare(b.ruta, "es", { numeric: true, sensitivity: "base" }));
}
async function descargarDocumentos(driveId, docs) {
    const pendientes = docs.filter((d) => d.modo !== null);
    let siguiente = 0;
    const trabajador = async () => {
        while (siguiente < pendientes.length) {
            const doc = pendientes[siguiente++];
            if (!doc)
                break;
            try {
                const buffer = await descargarArchivoComoPdf(driveId, doc.itemId, doc.modo === "CONVERTIR");
                const pdf = await PdfLib.load(buffer, { ignoreEncryption: true });
                const paginas = pdf.getPageCount();
                if (paginas === 0)
                    throw new Error("PDF_SIN_PAGINAS");
                doc.pdf = pdf;
                doc.paginas = paginas;
            }
            catch (error) {
                doc.motivo = motivoError(error);
                console.warn("[LEYPD EXPEDIENTE]", doc.ruta, error instanceof Error ? error.message : error);
            }
        }
    };
    await Promise.all(Array.from({ length: DESCARGAS_EN_PARALELO }, trabajador));
}
function construirPortada({ detalle, docs, logoEmpresa, generadoPor, generadoAt }) {
    return new Promise((resolve, reject) => {
        const { empresa, resumen, elementos } = detalle;
        const doc = new PDFDocument({
            size: "A4",
            margins: { top: 50, right: 45, bottom: 55, left: 45 },
            bufferPages: true,
            info: {
                Title: `Expediente Ley PD ${empresa.nombre}`,
                Subject: "Expediente interno Ley 21.719",
                Author: "RIDS",
            },
        });
        const chunks = [];
        doc.on("data", (c) => chunks.push(c));
        doc.on("end", () => resolve({ buffer: Buffer.concat(chunks), paginas }));
        doc.on("error", reject);
        let paginas = 1;
        doc.on("pageAdded", () => { paginas++; });
        const izquierda = doc.page.margins.left;
        const ancho = doc.page.width - doc.page.margins.left - doc.page.margins.right;
        const limiteInferior = () => doc.page.height - doc.page.margins.bottom;
        const asegurarEspacio = (alto) => {
            if (doc.y + alto > limiteInferior())
                doc.addPage();
        };
        function tituloSeccion(titulo, derecha) {
            asegurarEspacio(110);
            doc.moveDown(0.6);
            const y = doc.y;
            doc.rect(izquierda, y, ancho, 24).fill(COLOR.primario);
            doc.fillColor("#ffffff").font("Helvetica-Bold").fontSize(12)
                .text(titulo, izquierda + 10, y + 6, { width: ancho - 150, lineBreak: false });
            if (derecha) {
                doc.font("Helvetica").fontSize(9)
                    .text(derecha, izquierda + ancho - 140, y + 8, { width: 130, align: "right", lineBreak: false });
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
        /* ---------------- portada ---------------- */
        const yLogos = 50;
        const rids = logoRids();
        if (rids)
            doc.image(rids, izquierda, yLogos, { fit: [150, 60] });
        if (logoEmpresa)
            doc.image(logoEmpresa, izquierda + ancho - 150, yLogos, { fit: [150, 60], align: "right" });
        doc.y = 190;
        doc.fillColor(COLOR.primario).font("Helvetica-Bold").fontSize(26)
            .text("Expediente Ley PD", izquierda, doc.y, { width: ancho, align: "center" });
        doc.moveDown(0.3);
        doc.fillColor(COLOR.texto).font("Helvetica").fontSize(12)
            .text("Ley 21.719 de Protección de Datos Personales", { width: ancho, align: "center" });
        doc.moveDown(2.2);
        doc.fillColor(COLOR.texto).font("Helvetica-Bold").fontSize(18)
            .text(empresa.nombre, { width: ancho, align: "center" });
        if (empresa.razonSocial && empresa.razonSocial !== empresa.nombre) {
            doc.moveDown(0.2);
            doc.fillColor(COLOR.suave).font("Helvetica").fontSize(11)
                .text(empresa.razonSocial, { width: ancho, align: "center" });
        }
        const incluidos = docs.filter((d) => d.pdf);
        const totalPaginasDocs = incluidos.reduce((a, d) => a + d.paginas, 0);
        doc.moveDown(3);
        const datos = [
            ["Generado", fechaHoraChile(generadoAt)],
            ["Generado por", generadoPor ?? "—"],
            ["Avance Ley PD", `${resumen.porcentaje}% (${resumen.completados} de ${resumen.total} elementos)`],
            ["Documentos incluidos", `${incluidos.length} de ${docs.length} (${totalPaginasDocs} páginas)`],
        ];
        for (const [etiqueta, valor] of datos) {
            const y = doc.y;
            doc.fillColor(COLOR.suave).font("Helvetica").fontSize(10)
                .text(etiqueta, izquierda + 90, y, { width: 140 });
            doc.fillColor(COLOR.texto).font("Helvetica-Bold").fontSize(10)
                .text(valor, izquierda + 230, y, { width: ancho - 320 });
            doc.moveDown(0.5);
        }
        /* Aviso de uso interno */
        const yAviso = doc.page.height - doc.page.margins.bottom - 60;
        doc.roundedRect(izquierda, yAviso, ancho, 44, 6).lineWidth(1).strokeColor(COLOR.ambar).stroke();
        doc.fillColor(COLOR.ambar).font("Helvetica-Bold").fontSize(10)
            .text("DOCUMENTO INTERNO RIDS", izquierda + 12, yAviso + 9, { width: ancho - 24 });
        doc.font("Helvetica").fontSize(8.5)
            .text("Incluye estados de avance y pendientes. No entregar al cliente: los documentos para el cliente están en su carpeta de SharePoint.", izquierda + 12, yAviso + 22, { width: ancho - 24 });
        /* ---------------- estado de elementos ---------------- */
        doc.addPage();
        doc.y = doc.page.margins.top;
        tituloSeccion("Estado de los elementos", `Avance ${resumen.porcentaje}%`);
        doc.fillColor(COLOR.suave).font("Helvetica").fontSize(8.5).text(`Implementados ${resumen.implementados} · No aplica ${resumen.noAplica} · En progreso ${resumen.enProgreso} · ` +
            `Sin iniciar ${resumen.sinIniciar} · Compromisos vencidos ${resumen.vencidos}`, izquierda, doc.y, { width: ancho });
        doc.moveDown(0.6);
        const hoy = new Date();
        const docsPorElemento = (numero) => {
            const del = docs.filter((d) => d.numero === numero);
            return `${del.filter((d) => d.pdf).length}/${del.length}`;
        };
        tabla(["N°", "Elemento", "Estado", "Responsable", "Compromiso", "Docs"], elementos.map((e) => {
            const est = ESTADO[e.estado] ?? { texto: e.estado, color: COLOR.texto };
            const cerrado = e.estado === "IMPLEMENTADO" || e.estado === "NO_APLICA";
            const vencido = !cerrado && e.fechaCompromiso !== null && e.fechaCompromiso < hoy;
            return [
                { t: formatearNumeroLeypd(e.numero), bold: true },
                { t: e.titulo },
                { t: est.texto, color: est.color, bold: true },
                { t: e.responsable ?? "—", color: e.responsable ? COLOR.texto : COLOR.suave },
                {
                    t: e.fechaCompromiso ? `${fechaDia(e.fechaCompromiso)}${vencido ? " (vencido)" : ""}` : "—",
                    color: vencido ? COLOR.rojo : e.fechaCompromiso ? COLOR.texto : COLOR.suave,
                },
                { t: docsPorElemento(e.numero), color: COLOR.suave },
            ];
        }), [5, 37, 14, 20, 15, 7]);
        const conObservaciones = elementos.filter((e) => e.observaciones?.trim());
        if (conObservaciones.length) {
            tituloSeccion("Observaciones");
            tabla(["N°", "Observación"], conObservaciones.map((e) => [
                { t: formatearNumeroLeypd(e.numero), bold: true },
                { t: e.observaciones?.trim() ?? "" },
            ]), [5, 95]);
        }
        /* ---------------- índice ---------------- */
        tituloSeccion("Índice de documentos", `${incluidos.length} de ${docs.length} incluidos`);
        const omitidos = docs.filter((d) => !d.pdf);
        if (omitidos.length) {
            doc.fillColor(COLOR.ambar).font("Helvetica").fontSize(8.5).text(`${omitidos.length} documento(s) no se incluyeron; el motivo aparece en la columna «Página».`, izquierda, doc.y, { width: ancho });
            doc.moveDown(0.5);
        }
        tabla(["N°", "Documento", "Página"], docs.map((d) => [
            { t: d.numero === null ? "—" : formatearNumeroLeypd(d.numero), bold: true },
            /* Fuera de las carpetas de elementos se muestra la ruta completa */
            { t: d.numero === null ? d.ruta : d.nombre },
            d.pdf
                ? { t: String(d.paginaInicio ?? "—"), bold: true }
                : { t: d.motivo ?? "No incluido", color: d.modo === null ? COLOR.suave : COLOR.rojo },
        ]), [6, 66, 28]);
        doc.end();
    });
}
/* =========================================================
   UNIR + NUMERAR (pdf-lib)
========================================================= */
async function unir(portada, docs, empresaNombre) {
    const final = await PdfLib.create();
    const pdfPortada = await PdfLib.load(portada);
    for (const p of await final.copyPages(pdfPortada, pdfPortada.getPageIndices()))
        final.addPage(p);
    for (const d of docs) {
        if (!d.pdf)
            continue;
        for (const p of await final.copyPages(d.pdf, d.pdf.getPageIndices()))
            final.addPage(p);
    }
    /* Pie con número de página en todas (menos las rotadas, para no dibujar de lado) */
    const fuente = await final.embedFont(StandardFonts.Helvetica);
    const paginas = final.getPages();
    const total = paginas.length;
    const base = textoWinAnsi(`Expediente Ley PD · ${empresaNombre} · Uso interno RIDS`);
    paginas.forEach((pagina, i) => {
        if (pagina.getRotation().angle % 360 !== 0)
            return;
        const texto = `${base} · ${i + 1} / ${total}`;
        const tam = 6.5;
        const { width } = pagina.getSize();
        const anchoTexto = fuente.widthOfTextAtSize(texto, tam);
        pagina.drawText(texto, {
            x: Math.max(10, width - anchoTexto - 24),
            y: 12,
            size: tam,
            font: fuente,
            color: rgb(0.45, 0.5, 0.56),
        });
    });
    final.setTitle(textoWinAnsi(`Expediente Ley PD ${empresaNombre}`));
    final.setAuthor("RIDS");
    final.setCreator("CRM RIDS");
    return Buffer.from(await final.save());
}
/* =========================================================
   GENERAR
========================================================= */
export async function generarExpedienteLeypdPdf(empresaId, generadoPor) {
    if (enCurso.has(empresaId))
        throw new Error("EXPEDIENTE_EN_CURSO");
    enCurso.add(empresaId);
    try {
        /* Lanza EMPRESA_NO_ENCONTRADA si no existe */
        const detalle = await obtenerDetalleLeypdEmpresa(empresaId);
        const sharepoint = await prisma.leypdSharepoint.findUnique({
            where: { empresaId },
            select: { driveId: true },
        });
        if (!sharepoint)
            throw new Error("SHAREPOINT_NO_VINCULADO");
        const registros = await prisma.leypdDocumentoGenerado.findMany({
            where: { empresaId },
            select: { ruta: true, itemId: true },
        });
        if (registros.length === 0)
            throw new Error("SIN_DOCUMENTOS_GENERADOS");
        const docs = prepararDocumentos(registros);
        const [logoEmpresa] = await Promise.all([
            logoEmpresaPngParaPdf(empresaId),
            descargarDocumentos(sharepoint.driveId, docs),
        ]);
        const generadoAt = new Date();
        const entrada = { detalle, docs, logoEmpresa, generadoPor: generadoPor ?? null, generadoAt };
        /*
         * El índice necesita saber cuántas páginas ocupa la portada, y la portada
         * incluye el índice: se calcula hasta que el número de páginas se estabiliza.
         */
        let paginasPortada = 0;
        let portada = null;
        for (let intento = 0; intento < 3; intento++) {
            let pagina = paginasPortada + 1;
            for (const d of docs) {
                d.paginaInicio = d.pdf ? pagina : null;
                pagina += d.pdf ? d.paginas : 0;
            }
            portada = await construirPortada(entrada);
            if (portada.paginas === paginasPortada)
                break;
            paginasPortada = portada.paginas;
        }
        if (!portada)
            throw new Error("EXPEDIENTE_SIN_PORTADA");
        const buffer = await unir(portada.buffer, docs, detalle.empresa.nombre);
        const hoy = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Santiago" }).format(generadoAt);
        const incluidos = docs.filter((d) => d.pdf).length;
        return {
            buffer,
            nombreArchivo: `Expediente_LeyPD_${nombreArchivoSeguro(detalle.empresa.nombre)}_${hoy}.pdf`,
            incluidos,
            omitidos: docs.length - incluidos,
        };
    }
    finally {
        enCurso.delete(empresaId);
    }
}
//# sourceMappingURL=leypd-expediente-pdf.service.js.map