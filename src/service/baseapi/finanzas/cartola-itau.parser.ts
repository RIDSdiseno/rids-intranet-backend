// src/service/baseapi/finanzas/cartola-itau.parser.ts
// Fase 4b: lector de la «Consulta de pagos recibidos» de Itaú Empresas (Excel).
//
// Acepta dos formatos:
//   1. Una fila por pago (Excel limpio).
//   2. El PDF del portal convertido a Excel: cada celda de varias líneas queda partida en varias filas
//      (la hora en la fila siguiente «- 16:48:59», el resto del nombre, «otros bancos», etc.).
//      Un pago empieza en la fila cuya columna «Fecha Pago» trae una fecha; las filas siguientes sin
//      fecha se unen a ese pago.
// Se saltan el título («Itaú Empresas», «Cliente: …»), los encabezados repetidos en cada página y el pie
// («(600) …», «Infórmese…», «Página N»).

import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const XLSX = require("xlsx");

/* =========================================================
   TYPES
========================================================= */

export type PagoCartola = {
    /** Fila de Excel donde empieza el pago (1 = primera fila), para mensajes. */
    fila: number;
    /** YYYY-MM-DD */
    fecha: string;
    /** HH:MM:SS o null si la cartola no la trae. */
    hora: string | null;
    rutPagador: string | null;
    nombrePagador: string | null;
    producto: string | null;
    referencia: string | null;
    medioPago: string | null;
    estado: string | null;
    monto: number;
};

export type ResultadoLecturaCartola = {
    pagos: PagoCartola[];
    /** Problemas por fila (montos ilegibles, fechas inválidas). No detienen la lectura. */
    advertencias: string[];
    /** «Cliente: …» del encabezado de Itaú, si viene. */
    titular: string | null;
};

export class CartolaError extends Error { }

/* =========================================================
   COLUMNAS
========================================================= */

type Campo = "fecha" | "rut" | "nombre" | "producto" | "referencia" | "medio" | "estado" | "monto";

function normalizarTexto(value: unknown) {
    return String(value ?? "")
        .normalize("NFD")
        .replace(/[̀-ͯ]/g, "")
        .replace(/\s+/g, " ")
        .trim()
        .toLowerCase();
}

/** Encabezado → campo. */
function campoDeEncabezado(value: unknown): Campo | null {
    const t = normalizarTexto(value);
    if (!t) return null;
    if (t.startsWith("fecha")) return "fecha";
    if (t.includes("rut")) return "rut";
    if (t.includes("nombre")) return "nombre";
    if (t.startsWith("producto")) return "producto";
    if (t.startsWith("referencia") || t.startsWith("glosa") || t.startsWith("descripcion")) return "referencia";
    if (t.startsWith("medio")) return "medio";
    if (t.startsWith("estado")) return "estado";
    if (t.startsWith("monto") || t.startsWith("abono")) return "monto";
    return null;
}

/* =========================================================
   VALORES
========================================================= */

function pad(n: number) {
    return String(n).padStart(2, "0");
}

/** Fecha de la celda (número de serie de Excel, Date o texto dd/mm/aaaa [hh:mm[:ss]]). */
function leerFecha(value: unknown): { fecha: string; hora: string | null } | null {
    // Número de serie de Excel: se decodifica sin zona horaria (evita los segundos fantasma de cellDates).
    if (typeof value === "number" && value > 20000 && value < 80000) {
        const d = XLSX.SSF.parse_date_code(value);
        if (!d) return null;
        const fecha = `${d.y}-${pad(d.m)}-${pad(d.d)}`;
        return { fecha, hora: d.H || d.M || d.S ? `${pad(d.H)}:${pad(d.M)}:${pad(Math.floor(d.S))}` : null };
    }

    if (value instanceof Date && !Number.isNaN(value.getTime())) {
        // xlsx con cellDates entrega la fecha en hora local del servidor: se toman sus componentes.
        const fecha = `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())}`;
        const h = value.getHours();
        const m = value.getMinutes();
        const s = value.getSeconds();
        return { fecha, hora: h || m || s ? `${pad(h)}:${pad(m)}:${pad(s)}` : null };
    }

    const texto = String(value ?? "").trim();
    const m = texto.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})(?:\D+(\d{1,2}):(\d{2})(?::(\d{2}))?)?/);
    if (!m) return null;

    const [, d, mes, a, hh, mm, ss] = m;
    const fecha = `${a}-${pad(Number(mes))}-${pad(Number(d))}`;
    return { fecha, hora: hh ? `${pad(Number(hh))}:${mm}:${ss ?? "00"}` : null };
}

/** «- 16:48:59» → «16:48:59» */
function leerHora(value: unknown): string | null {
    const m = String(value ?? "").match(/(\d{1,2}):(\d{2})(?::(\d{2}))?/);
    return m ? `${pad(Number(m[1]))}:${m[2]}:${m[3] ?? "00"}` : null;
}

/** 331800 | «$331.800» | «331.800» → 331800 */
function leerMonto(value: unknown): number | null {
    if (typeof value === "number" && Number.isFinite(value)) return Math.round(value);
    const limpio = String(value ?? "").replace(/[^0-9,-]/g, "").replace(/,\d{1,2}$/, "");
    if (!limpio || limpio === "-") return null;
    const n = Number(limpio.replace(/,/g, ""));
    return Number.isFinite(n) ? n : null;
}

function esPie(value: unknown) {
    const t = normalizarTexto(value);
    return t.startsWith("(600)") || t.startsWith("informese") || /^pagina \d+/.test(t) || t.startsWith("itau phone");
}

/* =========================================================
   LECTURA
========================================================= */

export function leerCartolaItau(buffer: Buffer): ResultadoLecturaCartola {
    let workbook: any;
    try {
        workbook = XLSX.read(buffer, { type: "buffer" });
    } catch {
        throw new CartolaError("No se pudo leer el archivo. Sube un Excel (.xlsx o .xls) o un CSV.");
    }

    const pagos: PagoCartola[] = [];
    const advertencias: string[] = [];
    let titular: string | null = null;

    for (const nombreHoja of workbook.SheetNames as string[]) {
        const hoja = workbook.Sheets[nombreHoja];
        const filas: unknown[][] = XLSX.utils.sheet_to_json(hoja, { header: 1, raw: true, defval: null, blankrows: false });

        let columnas: Array<Campo | null> | null = null;
        let actual: (Record<Campo, string[]> & { fila: number; fechaInicial: { fecha: string; hora: string | null } }) | null = null;

        const cerrar = () => {
            if (!actual) return;
            const unir = (campo: Campo) => actual![campo].join(" ").replace(/\s+/g, " ").trim() || null;

            const montoTexto = actual.monto.find((v) => leerMonto(v) !== null);
            const monto = montoTexto !== undefined ? leerMonto(montoTexto) : null;
            const hora = actual.fechaInicial.hora ?? actual.fecha.map(leerHora).find(Boolean) ?? null;

            if (monto === null || monto <= 0) {
                advertencias.push(`Fila ${actual.fila}: monto ilegible, se omitió.`);
            } else {
                pagos.push({
                    fila: actual.fila,
                    fecha: actual.fechaInicial.fecha,
                    hora,
                    rutPagador: unir("rut"),
                    nombrePagador: unir("nombre"),
                    producto: unir("producto"),
                    referencia: unir("referencia"),
                    medioPago: unir("medio"),
                    estado: unir("estado"),
                    monto,
                });
            }
            actual = null;
        };

        filas.forEach((fila, i) => {
            const numeroFila = i + 1;
            const primera = fila.find((v) => v !== null && String(v).trim() !== "");

            if (primera === undefined) return;

            // Título y titular.
            const textoPrimera = String(primera);
            const cliente = textoPrimera.match(/Cliente:\s*([^\n]+)/i);
            if (cliente?.[1]) titular = cliente[1].trim();

            // Pie de página: corta el pago en curso.
            if (esPie(primera)) {
                cerrar();
                return;
            }

            // Encabezado (se repite en cada página).
            const campos = fila.map(campoDeEncabezado);
            if (campos.includes("fecha") && campos.includes("monto")) {
                cerrar();
                columnas = campos;
                return;
            }

            if (!columnas) return;

            const iFecha = columnas.indexOf("fecha");
            const fecha = leerFecha(fila[iFecha]);

            if (fecha) {
                cerrar();
                actual = {
                    fila: numeroFila,
                    fechaInicial: fecha,
                    fecha: [],
                    rut: [],
                    nombre: [],
                    producto: [],
                    referencia: [],
                    medio: [],
                    estado: [],
                    monto: [],
                };
            } else if (!actual) {
                return;
            }

            columnas.forEach((campo, j) => {
                const valor = fila[j];
                if (!campo || valor === null || valor === undefined || String(valor).trim() === "") return;
                if (campo === "fecha" && fecha) return;
                actual![campo].push(valor instanceof Date ? valor.toISOString() : String(valor));
            });
        });

        cerrar();
    }

    if (pagos.length === 0) {
        throw new CartolaError("No se encontraron pagos. Revisa que el archivo tenga las columnas «Fecha Pago» y «Monto».");
    }

    return { pagos, advertencias, titular };
}