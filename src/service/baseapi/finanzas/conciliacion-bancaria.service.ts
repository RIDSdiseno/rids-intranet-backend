// src/service/baseapi/finanzas/conciliacion-bancaria.service.ts
// Fase 4b: conciliación bancaria (equivalente a Duematch) con la «Consulta de pagos recibidos» de Itaú.
//
// Flujo:
//   1. importarCartola: lee el Excel, guarda cada pago como MovimientoBancario (sin duplicar por `huella`)
//      y descarta solos los traspasos entre RIDS y ECONNET y los pagadores ya descartados antes.
//   2. listarMovimientos: a cada movimiento PENDIENTE le calcula una propuesta contra las facturas del núcleo:
//        PERFECTO   folio en la referencia + monto exacto, o RUT + monto exacto con una sola factura posible
//        COMBINADO  varias facturas del mismo cliente que suman exacto el monto
//        YA_PAGADA  la factura ya está pagada en el CRM (Duemint o a mano): solo se vincula, sin abono
//        SUGERIDO   el cliente tiene facturas abiertas pero no calza exacto (abono parcial o por antigüedad)
//        SIN_MATCH  nada que proponer
//      Para el RUT se usan el del pagador, los RUT escritos en la referencia y los clientes por los que ese
//      pagador ya pagó antes (lo «aprende» de los movimientos conciliados).
//   3. confirmarMovimiento: siempre lo confirma una persona. Crea los abonos (origen CARTOLA, con el id
//      del movimiento) y, si completan el saldo, la factura queda pagada (Fase 4a).
//   4. deshacerMovimiento / descartarMovimiento / restaurarMovimiento.

import { prisma } from "../../../lib/prisma.js";

import type { EmpresaKey } from "../cobranza/cobranza-estado.service.js";

import { leerCartolaItau, type PagoCartola } from "./cartola-itau.parser.js";
import { eliminarAbonoCxc, registrarAbonoCxc } from "./cxc-abonos.service.js";

/* =========================================================
   TYPES
========================================================= */

/** Lo que se usa de un documento del núcleo (DocumentoCxc del controlador). */
export type DocumentoBanco = {
    key: string;
    tipoDoc: string;
    folio: string;
    rutContraparte: string;
    razonSocial: string | null;
    fechaEmision: string | null;
    montoOriginal: number;
    montoNotasCredito: number;
    saldo: number;
    estado: "PAGADO" | "PENDIENTE" | "VENCIDO" | "COMPENSADO";
    pagadoAt: string | null;
};

export type TipoPropuesta = "PERFECTO" | "COMBINADO" | "YA_PAGADA" | "SUGERIDO" | "SIN_MATCH";

export type AsignacionPropuesta = {
    tipoDoc: string;
    folio: string;
    rutContraparte: string;
    razonSocial: string | null;
    fechaEmision: string | null;
    estado: DocumentoBanco["estado"];
    /** Pendiente (abiertas) o monto − NC (pagadas). */
    saldo: number;
    monto: number;
    accion: "ABONO" | "VINCULO";
};

export type Propuesta = {
    tipo: TipoPropuesta;
    motivo: string;
    asignaciones: AsignacionPropuesta[];
};

export type MovimientoVista = {
    id: number;
    empresaKey: string;
    fecha: string;
    hora: string | null;
    rutPagador: string | null;
    nombrePagador: string | null;
    producto: string | null;
    referencia: string | null;
    medioPago: string | null;
    monto: number;
    estado: string;
    motivoDescarte: string | null;
    observacion: string | null;
    archivo: string | null;
    responsable: string | null;
    conciliadoAt: string | null;
    propuesta: Propuesta | null;
    asignaciones: Array<{
        id: number;
        tipoDoc: string;
        folio: string;
        rutContraparte: string;
        razonSocial: string | null;
        monto: number;
        tipo: string;
    }>;
};

export type ResultadoImportacion = {
    aplicado: boolean;
    titular: string | null;
    leidos: number;
    nuevos: number;
    duplicados: number;
    noPagados: number;
    descartadosAuto: number;
    /** Pagos nuevos que se parecen a otro (mismo día + pagador + monto) aunque cambie la hora, la referencia o el nombre. */
    posiblesDuplicados: number;
    /** Posibles duplicados que no se importaron porque se pidió omitirlos. */
    omitidos: number;
    total: number;
    advertencias: string[];
    filas: Array<PagoCartola & { duplicado: boolean; descarteAuto: string | null; posibleDuplicado: PosibleDuplicado | null }>;
};

export type PosibleDuplicado = {
    /** CARGADO: se parece a un movimiento ya guardado. ARCHIVO: se parece a otra fila del mismo archivo. */
    origen: "CARGADO" | "ARCHIVO";
    detalle: string;
};

/** Prefijo de la observación de los movimientos importados como posible duplicado (la pantalla lo usa para marcarlos). */
export const PREFIJO_POSIBLE_DUPLICADO = "Posible duplicado";

export class BancoError extends Error { }

export const MOTIVOS_DESCARTE = ["TRASPASO_EMPRESAS", "PASARELA", "NO_ES_CLIENTE", "DUPLICADO", "OTRO"] as const;
export type MotivoDescarte = (typeof MOTIVOS_DESCARTE)[number];

/* =========================================================
   HELPERS
========================================================= */

/** RUT de las empresas del grupo: un pago entre ellas es un traspaso, no un pago de factura. */
const RUT_EMPRESAS: Record<EmpresaKey, string> = { rids: "778251868", econnet: "767583524" };

const TIPOS_FACTURA = new Set(["33", "34", "56"]);

function normalizarRut(value: unknown) {
    return String(value ?? "").replace(/[^0-9kK]/g, "").toUpperCase();
}

function normalizarTexto(value: unknown) {
    return String(value ?? "")
        .normalize("NFD")
        .replace(/[̀-ͯ]/g, "")
        .replace(/\s+/g, " ")
        .trim()
        .toUpperCase();
}

/** Minutos de diferencia entre la hora de Chile y UTC en ese instante (−180 o −240). */
function offsetSantiagoMin(fecha: Date) {
    const partes = Object.fromEntries(
        new Intl.DateTimeFormat("en-US", {
            timeZone: "America/Santiago",
            hourCycle: "h23",
            year: "numeric",
            month: "2-digit",
            day: "2-digit",
            hour: "2-digit",
            minute: "2-digit",
            second: "2-digit",
        })
            .formatToParts(fecha)
            .map((p) => [p.type, p.value]),
    );
    const comoUtc = Date.UTC(Number(partes.year), Number(partes.month) - 1, Number(partes.day), Number(partes.hour), Number(partes.minute), Number(partes.second));
    return Math.round((comoUtc - fecha.getTime()) / 60000);
}

/** Fecha y hora locales de Chile → Date (sin hora: mediodía, para que el día no cambie). */
function chileADate(fecha: string, hora: string | null) {
    const aproximada = new Date(`${fecha}T${hora ?? "12:00:00"}Z`);
    return new Date(aproximada.getTime() - offsetSantiagoMin(aproximada) * 60000);
}

function fechaChile(fecha: Date) {
    return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Santiago", year: "numeric", month: "2-digit", day: "2-digit" }).format(fecha);
}

function horaChile(fecha: Date) {
    return new Intl.DateTimeFormat("en-GB", { timeZone: "America/Santiago", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" }).format(fecha);
}

function huellaPago(empresaKey: EmpresaKey, p: PagoCartola) {
    return [
        empresaKey,
        `${p.fecha}T${p.hora ?? ""}`,
        normalizarRut(p.rutPagador),
        p.monto,
        normalizarTexto(p.referencia),
        normalizarTexto(p.nombrePagador),
    ].join("|");
}

/** Clave «tolerante»: mismo día, mismo pagador (RUT, o nombre si no hay RUT) y mismo monto. */
function clavePosibleDuplicado(fecha: string, rut: string | null, nombre: string | null, monto: number) {
    return `${fecha}|${normalizarRut(rut) || normalizarTexto(nombre)}|${monto}`;
}

const ESTADO_MOV_LABEL: Record<string, string> = { PENDIENTE: "pendiente", CONCILIADO: "conciliado", DESCARTADO: "descartado" };

function diasEntre(a: string, b: string) {
    return Math.abs(Date.parse(`${a}T00:00:00Z`) - Date.parse(`${b}T00:00:00Z`)) / 86_400_000;
}

/* =========================================================
   REFERENCIA: folios y RUT
========================================================= */

/** «Paga F 577», «pago FX 572», «FACTURAS 580 Y 581», «F577/578» → ["577", "572", ...] */
export function foliosEnReferencia(referencia: string | null): string[] {
    const texto = normalizarTexto(referencia);
    if (!texto) return [];

    const folios = new Set<string>();
    const etiqueta = /(?:^|[^A-Z0-9])(?:FACTURAS?|FACTS?|FACS?|FX|FE|FA|F|NRO|N[°º]|#)\s*[.:°º#-]?\s*(\d{1,7}(?:\s*(?:,|Y|\/|&|-)\s*\d{1,7})*)/g;

    for (const m of texto.matchAll(etiqueta)) {
        for (const n of (m[1] ?? "").split(/\s*(?:,|Y|\/|&|-)\s*/)) {
            const folio = String(Number(n));
            if (folio !== "0" && folio !== "NaN") folios.add(folio);
        }
    }

    return Array.from(folios);
}

/** «Rut 76 527 100 2», «76.527.100-2» → ["765271002"] */
export function rutsEnReferencia(referencia: string | null): string[] {
    const texto = normalizarTexto(referencia);
    const ruts = new Set<string>();
    for (const m of texto.matchAll(/(?:^|\D)(\d{1,2})[.\s]?(\d{3})[.\s]?(\d{3})\s*-?\s*([\dK])(?=\W|$)/g)) {
        ruts.add(`${m[1]}${m[2]}${m[3]}${m[4]}`);
    }
    return Array.from(ruts);
}

/* =========================================================
   MOTOR DE CRUCE
========================================================= */

type Contexto = {
    docs: DocumentoBanco[];
    /** Facturas pagadas que ya quedaron vinculadas a otro movimiento. */
    vinculadas: Set<string>;
    /** RUT pagador → clientes por los que pagó antes. */
    aprendidos: Map<string, Set<string>>;
};

function asignacion(doc: DocumentoBanco, monto: number): AsignacionPropuesta {
    const pagada = doc.estado === "PAGADO";
    return {
        tipoDoc: doc.tipoDoc,
        folio: doc.folio,
        rutContraparte: doc.rutContraparte,
        razonSocial: doc.razonSocial,
        fechaEmision: doc.fechaEmision,
        estado: doc.estado,
        saldo: doc.saldo,
        monto,
        accion: pagada ? "VINCULO" : "ABONO",
    };
}

const abierta = (d: DocumentoBanco) => d.estado === "PENDIENTE" || d.estado === "VENCIDO";
const porAntiguedad = (a: DocumentoBanco, b: DocumentoBanco) => String(a.fechaEmision).localeCompare(String(b.fechaEmision)) || Number(a.folio) - Number(b.folio);

/** Combinación (la de menos facturas) cuyo saldo suma exacto el monto. Máximo 16 facturas. */
function combinacionExacta(docs: DocumentoBanco[], monto: number): DocumentoBanco[] | null {
    const lista = docs.slice(0, 16);
    let mejor: DocumentoBanco[] | null = null;

    for (let mask = 1; mask < 1 << lista.length; mask++) {
        let suma = 0;
        const elegidos: DocumentoBanco[] = [];
        for (let i = 0; i < lista.length; i++) {
            if (mask & (1 << i)) {
                suma += lista[i]!.saldo;
                elegidos.push(lista[i]!);
            }
        }
        if (suma === monto && elegidos.length > 1 && (!mejor || elegidos.length < mejor.length)) mejor = elegidos;
    }

    return mejor;
}

export function proponerCruce(mov: { rutPagador: string | null; referencia: string | null; monto: number; fecha: string }, ctx: Contexto): Propuesta {
    const cobrables = ctx.docs.filter((d) => TIPOS_FACTURA.has(d.tipoDoc) && d.estado !== "COMPENSADO");
    const rutPagador = normalizarRut(mov.rutPagador);
    const rutsRef = rutsEnReferencia(mov.referencia);
    const candidatos = new Set<string>([rutPagador, ...rutsRef, ...(ctx.aprendidos.get(rutPagador) ?? [])].filter(Boolean));
    const delCliente = (d: DocumentoBanco) => candidatos.has(normalizarRut(d.rutContraparte));
    const pagadaLibre = (d: DocumentoBanco) => d.estado === "PAGADO" && !ctx.vinculadas.has(d.key);

    /* 1. Folio(s) en la referencia */
    const folios = foliosEnReferencia(mov.referencia);
    if (folios.length) {
        const porFolio = cobrables.filter((d) => folios.includes(d.folio));
        // Si el folio existe en varios clientes, se prefieren los del pagador.
        const delFolio = porFolio.some(delCliente) ? porFolio.filter(delCliente) : porFolio;
        const abiertasFolio = delFolio.filter(abierta);

        const exacta = abiertasFolio.find((d) => d.saldo === mov.monto);
        if (exacta) return { tipo: "PERFECTO", motivo: `Folio ${exacta.folio} en la referencia y monto exacto.`, asignaciones: [asignacion(exacta, mov.monto)] };

        if (abiertasFolio.length > 1 && abiertasFolio.reduce((s, d) => s + d.saldo, 0) === mov.monto) {
            return {
                tipo: "COMBINADO",
                motivo: `Folios ${abiertasFolio.map((d) => d.folio).join(", ")} en la referencia; la suma calza exacto.`,
                asignaciones: abiertasFolio.map((d) => asignacion(d, d.saldo)),
            };
        }

        const pagada = delFolio.find((d) => pagadaLibre(d) && d.saldo === mov.monto);
        if (pagada) {
            return {
                tipo: "YA_PAGADA",
                motivo: `Folio ${pagada.folio} en la referencia; la factura ya figura pagada${pagada.pagadoAt ? ` el ${pagada.pagadoAt}` : ""}.`,
                asignaciones: [asignacion(pagada, mov.monto)],
            };
        }

        const mayor = abiertasFolio.find((d) => d.saldo > mov.monto);
        if (mayor) {
            return {
                tipo: "SUGERIDO",
                motivo: `Folio ${mayor.folio} en la referencia; el monto es menor al saldo (abono parcial).`,
                asignaciones: [asignacion(mayor, mov.monto)],
            };
        }
    }

    /* 2. RUT (pagador, referencia o aprendido) + monto */
    const abiertasCliente = cobrables.filter((d) => abierta(d) && delCliente(d)).sort(porAntiguedad);
    const exactas = abiertasCliente.filter((d) => d.saldo === mov.monto);

    if (exactas.length === 1) {
        const d = exactas[0]!;
        const viaRef = !rutPagador || normalizarRut(d.rutContraparte) !== rutPagador;
        return {
            tipo: "PERFECTO",
            motivo: viaRef ? "RUT escrito en la referencia (o pagador conocido) y monto exacto." : "RUT del pagador y monto exacto.",
            asignaciones: [asignacion(d, mov.monto)],
        };
    }

    if (exactas.length > 1) {
        return {
            tipo: "SUGERIDO",
            motivo: `Hay ${exactas.length} facturas abiertas del mismo monto: se propone la más antigua.`,
            asignaciones: [asignacion(exactas[0]!, mov.monto)],
        };
    }

    const combinacion = combinacionExacta(abiertasCliente, mov.monto);
    if (combinacion) {
        return {
            tipo: "COMBINADO",
            motivo: `${combinacion.length} facturas del cliente suman exacto el monto.`,
            asignaciones: combinacion.map((d) => asignacion(d, d.saldo)),
        };
    }

    /* 3. Factura ya pagada del mismo cliente y monto, pagada cerca de esa fecha */
    const pagadas = cobrables
        .filter((d) => pagadaLibre(d) && delCliente(d) && d.saldo === mov.monto && d.pagadoAt && diasEntre(d.pagadoAt, mov.fecha) <= 15)
        .sort((a, b) => diasEntre(a.pagadoAt!, mov.fecha) - diasEntre(b.pagadoAt!, mov.fecha));

    if (pagadas[0]) {
        return {
            tipo: "YA_PAGADA",
            motivo: `La factura del mismo cliente y monto ya figura pagada el ${pagadas[0].pagadoAt}.`,
            asignaciones: [asignacion(pagadas[0], mov.monto)],
        };
    }

    /* 4. Sugerido: facturas abiertas del cliente, de la más antigua a la más nueva */
    if (abiertasCliente.length) {
        let resto = mov.monto;
        const asignaciones: AsignacionPropuesta[] = [];
        for (const d of abiertasCliente) {
            if (resto <= 0) break;
            const monto = Math.min(resto, d.saldo);
            asignaciones.push(asignacion(d, monto));
            resto -= monto;
        }

        return {
            tipo: "SUGERIDO",
            motivo:
                resto > 0
                    ? `El pago supera la deuda abierta del cliente en ${resto.toLocaleString("es-CL")}: revisa antes de confirmar.`
                    : "No calza exacto: se reparte entre las facturas abiertas más antiguas del cliente.",
            asignaciones,
        };
    }

    return { tipo: "SIN_MATCH", motivo: "No hay facturas abiertas ni pagadas que calcen con el pagador, la referencia o el monto.", asignaciones: [] };
}

/* =========================================================
   CONTEXTO
========================================================= */

async function cargarContexto(empresaKey: EmpresaKey, docs: DocumentoBanco[]): Promise<Contexto> {
    const asignaciones = await prisma.movimientoBancarioAsignacion.findMany({
        where: { empresaKey },
        select: { tipoDoc: true, folio: true, rutContraparte: true, tipo: true, movimientoId: true },
    });

    const movimientos = await prisma.movimientoBancario.findMany({
        where: { id: { in: Array.from(new Set(asignaciones.map((a) => a.movimientoId))) } },
        select: { id: true, rutPagador: true },
    });
    const pagadorDe = new Map(movimientos.map((m) => [m.id, normalizarRut(m.rutPagador)]));

    const aprendidos = new Map<string, Set<string>>();
    const vinculadas = new Set<string>();

    for (const a of asignaciones) {
        const cliente = normalizarRut(a.rutContraparte);
        const pagador = pagadorDe.get(a.movimientoId);
        if (pagador && pagador !== cliente) {
            if (!aprendidos.has(pagador)) aprendidos.set(pagador, new Set());
            aprendidos.get(pagador)!.add(cliente);
        }
        if (a.tipo === "VINCULO") vinculadas.add(`${a.tipoDoc}|${a.folio}|${cliente}`);
    }

    // `key` del núcleo es tipo|folio|rut normalizado.
    const vinculadasPorKey = new Set(docs.filter((d) => vinculadas.has(`${d.tipoDoc}|${d.folio}|${normalizarRut(d.rutContraparte)}`)).map((d) => d.key));

    return { docs, vinculadas: vinculadasPorKey, aprendidos };
}

/* =========================================================
   IMPORTAR CARTOLA
========================================================= */

export async function importarCartola(params: {
    empresaKey: EmpresaKey;
    buffer: Buffer;
    archivo: string | null;
    responsable: string | null;
    aplicar: boolean;
    omitirPosibles?: boolean;
}): Promise<ResultadoImportacion> {
    const { empresaKey } = params;
    const lectura = leerCartolaItau(params.buffer);

    const pagados = lectura.pagos.filter((p) => !p.estado || normalizarTexto(p.estado) === "PAGADO");
    const noPagados = lectura.pagos.length - pagados.length;

    const huellas = pagados.map((p) => huellaPago(empresaKey, p));
    const existentes = new Set(
        (await prisma.movimientoBancario.findMany({ where: { huella: { in: huellas } }, select: { huella: true } })).map((m) => m.huella),
    );

    // Pagadores descartados antes (salvo «OTRO»): se descartan solos con el mismo motivo.
    const descartadosAntes = new Map(
        (
            await prisma.movimientoBancario.findMany({
                where: { empresaKey, estado: "DESCARTADO", motivoDescarte: { in: ["TRASPASO_EMPRESAS", "PASARELA", "NO_ES_CLIENTE"] } },
                select: { rutPagador: true, motivoDescarte: true },
                orderBy: { updatedAt: "desc" },
            })
        )
            .filter((m) => m.rutPagador)
            .map((m) => [m.rutPagador!, m.motivoDescarte!]),
    );

    const otraEmpresa = Object.entries(RUT_EMPRESAS).filter(([k]) => k !== empresaKey).map(([, rut]) => rut);

    // Posibles duplicados contra lo ya guardado: mismo día + pagador + monto, aunque cambie la hora
    // (un Excel la trae y otro no), la referencia o cómo viene cortado el nombre.
    const fechasNuevas = pagados.filter((_, i) => !existentes.has(huellas[i]!)).map((p) => p.fecha).sort();
    const cargadosPorClave = new Map<string, { id: number; hora: string; estado: string }>();
    if (fechasNuevas.length > 0) {
        const delPeriodo = await prisma.movimientoBancario.findMany({
            where: {
                empresaKey,
                fechaPago: { gte: chileADate(fechasNuevas[0]!, "00:00:00"), lte: chileADate(fechasNuevas[fechasNuevas.length - 1]!, "23:59:59") },
            },
            select: { id: true, fechaPago: true, rutPagador: true, nombrePagador: true, monto: true, estado: true },
            orderBy: { id: "asc" },
        });
        for (const m of delPeriodo) {
            const clave = clavePosibleDuplicado(fechaChile(m.fechaPago), m.rutPagador, m.nombrePagador, m.monto);
            if (!cargadosPorClave.has(clave)) cargadosPorClave.set(clave, { id: m.id, hora: horaChile(m.fechaPago).slice(0, 5), estado: m.estado });
        }
    }

    // Dentro del mismo archivo: la primera fila con esa clave queda limpia; las siguientes (con otra huella) se avisan.
    const vistasEnArchivo = new Map<string, { fila: number; huella: string }>();

    const filas = pagados.map((p, i) => {
        const rut = normalizarRut(p.rutPagador);
        const descarteAuto = otraEmpresa.includes(rut) ? "TRASPASO_EMPRESAS" : (descartadosAntes.get(rut) ?? null);
        const duplicado = existentes.has(huellas[i]!);

        let posibleDuplicado: PosibleDuplicado | null = null;
        if (!duplicado) {
            const clave = clavePosibleDuplicado(p.fecha, p.rutPagador, p.nombrePagador, p.monto);
            const cargado = cargadosPorClave.get(clave);
            const previa = vistasEnArchivo.get(clave);
            if (cargado) {
                posibleDuplicado = {
                    origen: "CARGADO",
                    detalle: `ya hay un pago igual del mismo día (${cargado.hora}, movimiento #${cargado.id}, ${ESTADO_MOV_LABEL[cargado.estado] ?? cargado.estado})`,
                };
            } else if (previa && previa.huella !== huellas[i]) {
                posibleDuplicado = { origen: "ARCHIVO", detalle: `mismo día, pagador y monto que la fila ${previa.fila} de este archivo` };
            }
            if (!previa) vistasEnArchivo.set(clave, { fila: p.fila, huella: huellas[i]! });
        }

        return { ...p, duplicado, descarteAuto, posibleDuplicado };
    });

    const nuevas = filas.filter((f) => !f.duplicado);
    // Dos filas idénticas dentro del mismo archivo cuentan una vez.
    const unicasTodas = new Map(nuevas.map((f) => [huellaPago(empresaKey, f), f]));
    const posiblesDuplicados = Array.from(unicasTodas.values()).filter((f) => f.posibleDuplicado).length;
    const unicas = params.omitirPosibles ? new Map(Array.from(unicasTodas.entries()).filter(([, f]) => !f.posibleDuplicado)) : unicasTodas;

    let creados = 0;
    if (params.aplicar && unicas.size > 0) {
        const resultado = await prisma.movimientoBancario.createMany({
            data: Array.from(unicas.entries()).map(([huella, f]) => ({
                empresaKey,
                banco: "ITAU",
                fechaPago: chileADate(f.fecha, f.hora),
                rutPagador: normalizarRut(f.rutPagador) || null,
                nombrePagador: f.nombrePagador,
                producto: f.producto,
                referencia: f.referencia,
                medioPago: f.medioPago,
                estadoBanco: f.estado,
                monto: f.monto,
                huella,
                estado: f.descarteAuto ? "DESCARTADO" : "PENDIENTE",
                motivoDescarte: f.descarteAuto,
                observacion: f.descarteAuto
                    ? "Descartado automáticamente al importar."
                    : f.posibleDuplicado
                        ? `${PREFIJO_POSIBLE_DUPLICADO}: ${f.posibleDuplicado.detalle}.`.slice(0, 250)
                        : null,
                archivo: params.archivo,
                responsable: params.responsable,
            })),
            skipDuplicates: true,
        });
        creados = resultado.count;
    }

    return {
        aplicado: params.aplicar,
        titular: lectura.titular,
        leidos: lectura.pagos.length,
        nuevos: params.aplicar ? creados : unicas.size,
        duplicados: filas.length - unicasTodas.size,
        noPagados,
        descartadosAuto: Array.from(unicas.values()).filter((f) => f.descarteAuto).length,
        posiblesDuplicados,
        omitidos: unicasTodas.size - unicas.size,
        total: pagados.reduce((s, p) => s + p.monto, 0),
        advertencias: lectura.advertencias,
        filas,
    };
}

/* =========================================================
   LISTAR
========================================================= */

export async function listarMovimientos(params: {
    empresaKey: EmpresaKey;
    docs: DocumentoBanco[];
    desde?: string | null;
    hasta?: string | null;
}): Promise<{ movimientos: MovimientoVista[]; resumen: Record<string, number> }> {
    const { empresaKey, docs } = params;

    const movimientos = await prisma.movimientoBancario.findMany({
        where: {
            empresaKey,
            ...(params.desde || params.hasta
                ? {
                    fechaPago: {
                        ...(params.desde ? { gte: chileADate(params.desde, "00:00:00") } : {}),
                        ...(params.hasta ? { lte: chileADate(params.hasta, "23:59:59") } : {}),
                    },
                }
                : {}),
        },
        include: { asignaciones: true },
        orderBy: [{ fechaPago: "desc" }, { id: "desc" }],
    });

    const ctx = await cargarContexto(empresaKey, docs);
    const razonPorKey = new Map(docs.map((d) => [`${d.tipoDoc}|${d.folio}|${normalizarRut(d.rutContraparte)}`, d.razonSocial]));

    const resumen: Record<string, number> = { PENDIENTE: 0, CONCILIADO: 0, DESCARTADO: 0, PERFECTO: 0, COMBINADO: 0, YA_PAGADA: 0, SUGERIDO: 0, SIN_MATCH: 0 };

    const vista = movimientos.map((m): MovimientoVista => {
        const fecha = fechaChile(m.fechaPago);
        const propuesta =
            m.estado === "PENDIENTE" ? proponerCruce({ rutPagador: m.rutPagador, referencia: m.referencia, monto: m.monto, fecha }, ctx) : null;

        resumen[m.estado] = (resumen[m.estado] ?? 0) + 1;
        if (propuesta) resumen[propuesta.tipo] = (resumen[propuesta.tipo] ?? 0) + 1;

        return {
            id: m.id,
            empresaKey: m.empresaKey,
            fecha,
            hora: horaChile(m.fechaPago),
            rutPagador: m.rutPagador,
            nombrePagador: m.nombrePagador,
            producto: m.producto,
            referencia: m.referencia,
            medioPago: m.medioPago,
            monto: m.monto,
            estado: m.estado,
            motivoDescarte: m.motivoDescarte,
            observacion: m.observacion,
            archivo: m.archivo,
            responsable: m.responsable,
            conciliadoAt: m.conciliadoAt?.toISOString() ?? null,
            propuesta,
            asignaciones: m.asignaciones.map((a) => ({
                id: a.id,
                tipoDoc: a.tipoDoc,
                folio: a.folio,
                rutContraparte: a.rutContraparte,
                razonSocial: razonPorKey.get(`${a.tipoDoc}|${a.folio}|${normalizarRut(a.rutContraparte)}`) ?? null,
                monto: a.monto,
                tipo: a.tipo,
            })),
        };
    });

    return { movimientos: vista, resumen };
}

/* =========================================================
   CONFIRMAR
========================================================= */

async function obtenerMovimiento(empresaKey: EmpresaKey, id: number) {
    const mov = await prisma.movimientoBancario.findFirst({ where: { id, empresaKey }, include: { asignaciones: true } });
    if (!mov) throw new BancoError("El movimiento no existe.");
    return mov;
}

export async function confirmarMovimiento(params: {
    empresaKey: EmpresaKey;
    movimientoId: number;
    asignaciones: Array<{ tipoDoc: string; folio: string; rutContraparte: string; monto: number }>;
    docs: DocumentoBanco[];
    responsable: string | null;
}) {
    const { empresaKey, docs } = params;
    const mov = await obtenerMovimiento(empresaKey, params.movimientoId);
    if (mov.estado !== "PENDIENTE") throw new BancoError("El movimiento ya no está pendiente.");

    if (params.asignaciones.length === 0) throw new BancoError("Elige al menos una factura.");

    // Validación previa de todo, antes de escribir.
    const porKey = new Map(docs.map((d) => [`${d.tipoDoc}|${d.folio}|${normalizarRut(d.rutContraparte)}`, d]));
    const vistas = new Set<string>();
    let suma = 0;

    const items = params.asignaciones.map((a) => {
        const key = `${String(a.tipoDoc).trim()}|${String(a.folio).trim()}|${normalizarRut(a.rutContraparte)}`;
        const doc = porKey.get(key);
        if (!doc) throw new BancoError(`La factura ${a.tipoDoc}-${a.folio} no existe en cuentas por cobrar.`);
        if (vistas.has(key)) throw new BancoError(`La factura ${a.tipoDoc}-${a.folio} está repetida.`);
        vistas.add(key);

        if (!Number.isInteger(a.monto) || a.monto <= 0) throw new BancoError(`Monto inválido para ${a.tipoDoc}-${a.folio}.`);
        if (doc.estado === "COMPENSADO") throw new BancoError(`La factura ${doc.tipoDoc}-${doc.folio} está anulada por NC.`);
        if (doc.estado !== "PAGADO" && a.monto > doc.saldo) {
            throw new BancoError(`El monto asignado a ${doc.tipoDoc}-${doc.folio} supera su saldo (${doc.saldo.toLocaleString("es-CL")}).`);
        }

        suma += a.monto;
        return { doc, monto: a.monto, tipo: doc.estado === "PAGADO" ? ("VINCULO" as const) : ("ABONO" as const) };
    });

    if (suma !== mov.monto) {
        throw new BancoError(`Lo asignado (${suma.toLocaleString("es-CL")}) debe sumar el monto del pago (${mov.monto.toLocaleString("es-CL")}).`);
    }

    const fechaPago = fechaChile(mov.fechaPago);
    const creados: Array<{ doc: DocumentoBanco; abonoId: number }> = [];

    try {
        for (const item of items) {
            let abonoId: number | null = null;

            if (item.tipo === "ABONO") {
                const resultado = await registrarAbonoCxc({
                    empresaKey,
                    documento: item.doc,
                    monto: item.monto,
                    fechaPago,
                    formaPago: "TRANSFERENCIA",
                    observacion: `Cartola ${mov.banco}: ${mov.nombrePagador ?? mov.rutPagador ?? ""}${mov.referencia ? ` · ${mov.referencia}` : ""}`.slice(0, 250),
                    responsable: params.responsable,
                    origen: "CARTOLA",
                    movimientoId: mov.id,
                });
                abonoId = resultado.abonoId;
                creados.push({ doc: item.doc, abonoId });
            }

            await prisma.movimientoBancarioAsignacion.create({
                data: {
                    movimientoId: mov.id,
                    empresaKey,
                    tipoDoc: item.doc.tipoDoc,
                    folio: item.doc.folio,
                    rutContraparte: normalizarRut(item.doc.rutContraparte),
                    monto: item.monto,
                    tipo: item.tipo,
                    abonoId,
                },
            });
        }
    } catch (error) {
        // Deshace lo creado (abonos y asignaciones) para no dejar el movimiento a medias.
        for (const c of creados.reverse()) {
            await eliminarAbonoCxc({ empresaKey, documento: c.doc, abonoId: c.abonoId, desdeMovimiento: true }).catch(() => undefined);
        }
        await prisma.movimientoBancarioAsignacion.deleteMany({ where: { movimientoId: mov.id } });
        throw error;
    }

    await prisma.movimientoBancario.update({
        where: { id: mov.id },
        data: { estado: "CONCILIADO", conciliadoAt: new Date(), responsable: params.responsable, motivoDescarte: null },
    });

    return { abonos: creados.length, vinculos: items.length - creados.length };
}

/** Confirma en bloque los pendientes cuya propuesta es PERFECTO o YA_PAGADA (con la propuesta recalculada). */
export async function confirmarPerfectos(params: { empresaKey: EmpresaKey; ids: number[]; docs: DocumentoBanco[]; responsable: string | null }) {
    const { movimientos } = await listarMovimientos({ empresaKey: params.empresaKey, docs: params.docs });
    const elegibles = movimientos.filter(
        (m) =>
            m.estado === "PENDIENTE" &&
            (params.ids.length === 0 || params.ids.includes(m.id)) &&
            (m.propuesta?.tipo === "PERFECTO" || m.propuesta?.tipo === "YA_PAGADA"),
    );

    let confirmados = 0;
    const errores: Array<{ id: number; error: string }> = [];
    // Las facturas usadas en este lote no se repiten en otro movimiento del mismo lote.
    const usadas = new Set<string>();

    for (const m of elegibles) {
        const asignaciones = m.propuesta!.asignaciones;
        const claves = asignaciones.map((a) => `${a.tipoDoc}|${a.folio}|${normalizarRut(a.rutContraparte)}`);
        if (claves.some((k) => usadas.has(k))) {
            errores.push({ id: m.id, error: "La misma factura calza con otro pago del lote: revísalo a mano." });
            continue;
        }

        try {
            await confirmarMovimiento({
                empresaKey: params.empresaKey,
                movimientoId: m.id,
                asignaciones: asignaciones.map((a) => ({ tipoDoc: a.tipoDoc, folio: a.folio, rutContraparte: a.rutContraparte, monto: a.monto })),
                docs: params.docs,
                responsable: params.responsable,
            });
            claves.forEach((k) => usadas.add(k));
            confirmados++;
        } catch (error) {
            errores.push({ id: m.id, error: error instanceof Error ? error.message : String(error) });
        }
    }

    return { confirmados, errores };
}

/* =========================================================
   DESHACER / DESCARTAR / RESTAURAR
========================================================= */

export async function deshacerMovimiento(params: { empresaKey: EmpresaKey; movimientoId: number; docs: DocumentoBanco[] }) {
    const { empresaKey } = params;
    const mov = await obtenerMovimiento(empresaKey, params.movimientoId);
    if (mov.estado !== "CONCILIADO") throw new BancoError("El movimiento no está conciliado.");

    const porKey = new Map(params.docs.map((d) => [`${d.tipoDoc}|${d.folio}|${normalizarRut(d.rutContraparte)}`, d]));

    for (const a of mov.asignaciones) {
        if (a.tipo === "ABONO" && a.abonoId) {
            const doc = porKey.get(`${a.tipoDoc}|${a.folio}|${normalizarRut(a.rutContraparte)}`);
            if (!doc) throw new BancoError(`No se encontró la factura ${a.tipoDoc}-${a.folio} para quitar su abono. Usa «Recalcular».`);
            const existe = await prisma.rcvAbono.findUnique({ where: { id: a.abonoId }, select: { id: true } });
            if (existe) await eliminarAbonoCxc({ empresaKey, documento: doc, abonoId: a.abonoId, desdeMovimiento: true });
        }
    }

    // relationMode = "prisma": primero los hijos.
    await prisma.movimientoBancarioAsignacion.deleteMany({ where: { movimientoId: mov.id } });
    await prisma.movimientoBancario.update({ where: { id: mov.id }, data: { estado: "PENDIENTE", conciliadoAt: null } });
}

export async function descartarMovimiento(params: { empresaKey: EmpresaKey; movimientoId: number; motivo: string; observacion: string | null; responsable: string | null }) {
    if (!(MOTIVOS_DESCARTE as readonly string[]).includes(params.motivo)) throw new BancoError("Motivo de descarte inválido.");

    const mov = await obtenerMovimiento(params.empresaKey, params.movimientoId);
    if (mov.estado !== "PENDIENTE") throw new BancoError("Solo se descartan movimientos pendientes.");

    await prisma.movimientoBancario.update({
        where: { id: mov.id },
        data: { estado: "DESCARTADO", motivoDescarte: params.motivo, observacion: params.observacion, responsable: params.responsable },
    });
}

export async function restaurarMovimiento(params: { empresaKey: EmpresaKey; movimientoId: number }) {
    const mov = await obtenerMovimiento(params.empresaKey, params.movimientoId);
    if (mov.estado !== "DESCARTADO") throw new BancoError("El movimiento no está descartado.");

    await prisma.movimientoBancario.update({ where: { id: mov.id }, data: { estado: "PENDIENTE", motivoDescarte: null, observacion: null } });
}