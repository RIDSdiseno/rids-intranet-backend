// src/service/baseapi/finanzas/cxc-documentos.service.ts

/* =========================================================
   CUENTAS POR COBRAR (estilo Duemint) — SOLO LECTURA

   Fuente única para el Resumen de Finanzas:
   - Documentos: todos los caches RCV de ventas (SiiApiCache),
     uno por año-mes (prioriza "baseapi-rcv-ventas").
   - Pago: RcvConciliacion CONCILIADA (pagadoAt = conciliadoAt;
     en lo importado desde Duemint es la fecha real de pago).
   - Vencimiento: obtenerEstadosDocumentosCobranza (override /
     RcvVencimiento → documento → FacturaDTE → días de crédito).
   - NC / ND: obtenerAplicacionesNotasCredito (solo cache, salvo
     consultaSii = true).

   No consulta BaseAPI (salvo consultaSii) y no escribe en la BD.
   ========================================================= */

import { prisma } from "../../../lib/prisma.js";

import {
    obtenerEstadosDocumentosCobranza,
    type EmpresaKey,
} from "../cobranza/cobranza-estado.service.js";

import {
    obtenerAplicacionesNotasCredito,
    type NotaCreditoAplicada,
} from "../cobranza/cobranza-notas-credito.service.js";

/* =========================================================
   TIPOS
   ========================================================= */

export type EstadoCxc = "PAGADO" | "PENDIENTE" | "VENCIDO" | "COMPENSADO";

export type TramoAntiguedad = "AL_DIA" | "1_30" | "31_60" | "61_90" | "MAS_90";

export type DocumentoCxc = {
    key: string;
    tipoDoc: string;
    folio: string;
    rutContraparte: string;
    razonSocial: string | null;
    periodo: string;
    fechaEmision: string | null;
    montoOriginal: number;
    montoNotasCredito: number;
    saldo: number;
    montoAbonado: number;
    abonos: number;
    notasCredito: NotaCreditoAplicada[];
    estado: EstadoCxc;
    fechaVencimiento: string | null;
    origenVencimiento: string;
    /** Convención de cobranza: >0 días vencido, <=0 faltan días. */
    diasDiferencia: number | null;
    tramo: TramoAntiguedad | null;
    pagadoAt: string | null;
    formaPago: string | null;
    vencimientoPactado: string | null;
};

export type DiagnosticoCxc = {
    periodosLeidos: string[];
    documentosRcv: number;
    duplicadosOmitidos: number;
    documentosCobrables: number;
    notasCreditoEnRcv: number;
    facturasConNc: number;
    compensados: number;
    ndSoloReversa: number;
    conciliadasEnBd: number;
    conciliadasEmparejadas: number;
    /** Conciliadas en BD sin documento en los caches leídos (máx. 50). */
    conciliadasSinDocumento: string[];
    sinVencimiento: number;
    origenVencimiento: Record<string, number>;
    plazoEmpresa: number;
    ncInferidas: Array<{ nc: string; factura: string; rut: string; monto: number }>;
    ncSinAplicar: Array<{ folio: string; periodo: string; rut: string; razonSocial: string | null; fechaEmision: string | null; monto: number }>;
};

/** Nota de crédito o débito del RCV y cómo se aplicó. */
export type NotaCxc = {
    tipoDoc: "61" | "56";
    folio: string;
    rutContraparte: string;
    razonSocial: string | null;
    periodo: string;
    fechaEmision: string | null;
    monto: number;
    /** Documento afectado (ej. "33-1245"); null si no se aplicó. */
    aplicadaA: string | null;
    metodo: "XML" | "INFERIDA" | "SIN_APLICAR" | "ND_REVERSA" | "ND_COBRABLE";
};

export type ResultadoDocumentosCxc = {
    empresaKey: EmpresaKey;
    hoy: string;
    documentos: DocumentoCxc[];
    notas: NotaCxc[];
    diagnostico: DiagnosticoCxc;
};

type Monto = { monto: number; documentos: number };

export type ResumenCxc = {
    empresaKey: EmpresaKey;
    hoy: string;
    tarjetas: {
        pagosMes: Monto;
        porVencer: Monto;
        vencido: Monto;
        sinVencimiento: Monto;
        /** porVencer + vencido + sinVencimiento */
        total: Monto;
    };
    antiguedad: Array<{ tramo: TramoAntiguedad; etiqueta: string } & Monto>;
    /** Por mes de emisión (últimos `meses`): saldo pagado, por vencer y vencido. */
    porMesEmision: Array<{ periodo: string; pagado: number; porVencer: number; vencido: number }>;
    /** Saldo abierto por mes de vencimiento (VENCIDO agrupado aparte). */
    proyeccion: Array<{ periodo: string } & Monto>;
    diagnostico: DiagnosticoCxc;
};

/* =========================================================
   HELPERS
   ========================================================= */

const TIPOS_COBRABLES = new Set(["33", "34", "56"]);

const ZONA = "America/Santiago";

function fechaChileIso(fecha: Date): string {
    // en-CA = YYYY-MM-DD
    return new Intl.DateTimeFormat("en-CA", {
        timeZone: ZONA,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
    }).format(fecha);
}

function normalizarRut(value: unknown): string {
    return String(value ?? "")
        .replace(/[^0-9kK]/g, "")
        .toUpperCase();
}

function getDocumentosVentas(data: any): any[] {
    const candidatos = [
        data,
        data?.detalleVentas,
        data?.ventas,
        data?.documentos,
        data?.items,
        data?.data?.datos,
        data?.data?.detalleVentas,
        data?.data?.ventas,
        data?.data?.documentos,
    ];

    for (const candidato of candidatos) {
        if (Array.isArray(candidato)) return candidato;
    }

    return [];
}

function getTipoDoc(doc: any): string {
    return String(doc?.["Tipo Doc"] ?? doc?.tipoDoc ?? doc?.tipoDTE ?? "").trim();
}

function getFolio(doc: any): string {
    return String(doc?.["Folio"] ?? doc?.folio ?? doc?.Nro ?? doc?.numero ?? "").trim();
}

/** Mismas claves que cobranza-notas-credito / cobranza-automatico. */
function getRut(doc: any): string {
    return normalizarRut(
        doc?.["Rut cliente"] ??
        doc?.["RUT Cliente"] ??
        doc?.["Rut Receptor"] ??
        doc?.["RUT Receptor"] ??
        doc?.rutCliente ??
        doc?.rutReceptor ??
        doc?.rut ??
        doc?.RUT ??
        "",
    );
}

function getRazonSocial(doc: any): string | null {
    const value = doc?.["Razon Social"] ?? doc?.["Razón Social"] ?? doc?.razonSocial ?? null;
    const texto = value === null || value === undefined ? "" : String(value).trim();
    return texto || null;
}

function toNumberCL(value: unknown): number {
    if (typeof value === "number") return Number.isFinite(value) ? value : 0;

    const raw = String(value ?? "").replace(/\$/g, "").replace(/\s/g, "").trim();
    if (!raw) return 0;

    const numero = Number(raw.replace(/\./g, "").replace(",", "."));
    return Number.isFinite(numero) ? numero : 0;
}

function getMontoTotal(doc: any): number {
    return Math.round(toNumberCL(doc?.["Monto total"] ?? doc?.["Monto Total"] ?? doc?.montoTotal ?? doc?.total ?? 0));
}

/** YYYY-MM-DD desde DD/MM/YYYY, YYYY-MM-DD o ISO con hora. */
function fechaEmisionIso(doc: any): string | null {
    const raw = String(
        doc?.["Fecha Docto"] ??
        doc?.["Fecha Documento"] ??
        doc?.["Fecha Emisión"] ??
        doc?.["Fecha Emision"] ??
        doc?.fechaDocto ??
        doc?.fechaDocumento ??
        doc?.fechaEmision ??
        doc?.FchEmis ??
        "",
    ).trim();

    if (!raw) return null;

    const latina = raw.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
    if (latina) return `${latina[3]}-${latina[2]}-${latina[1]}`;

    const iso = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;

    return null;
}

function tramoDe(estado: EstadoCxc, dias: number | null): TramoAntiguedad | null {
    if (estado === "PENDIENTE") return "AL_DIA";
    if (estado !== "VENCIDO" || dias === null) return null;
    if (dias <= 30) return "1_30";
    if (dias <= 60) return "31_60";
    if (dias <= 90) return "61_90";
    return "MAS_90";
}

function claveDocumento(tipoDoc: string, folio: string, rut: string): string {
    return [tipoDoc, folio, rut].join("|");
}

/* =========================================================
   PLAZO POR DEFECTO DE CADA EMPRESA (decisión 18-11-2026, igual que Duemint)

   - RIDS: 30 días desde la emisión. Solo cuando el documento no
     tiene ningún vencimiento (SIN_FECHA).
   - ECONNET: día 1 del mes siguiente a la emisión (si se emite el
     día 1, vence ese mismo día). PRIORITARIO: reemplaza los días de
     crédito del receptor (RECEPTOR_COBRANZA / DETALLE_EMPRESA) y los
     vencimientos que el cron guardó calculados por días de crédito
     (RcvVencimiento DIAS_CREDITO). Se respetan MANUAL, DUEMINT,
     LEGACY, DTE, DTE_CACHE, RCV y la fecha del propio documento.

   Solo afecta a este resumen. La cobranza automática sigue con su
   lógica (Fase 5).
   ========================================================= */

type PlazoEmpresa = { tipo: "DIAS"; dias: number; prioritario: boolean } | { tipo: "DIA_1_MES_SIGUIENTE"; prioritario: boolean };

export const PLAZO_EMPRESA: Record<EmpresaKey, PlazoEmpresa> = {
    rids: { tipo: "DIAS", dias: 30, prioritario: false },
    econnet: { tipo: "DIA_1_MES_SIGUIENTE", prioritario: true },
};

const MS_DIA = 86_400_000;

function isoAUtc(iso: string): number {
    const [ano, mes, dia] = iso.split("-").map(Number) as [number, number, number];
    return Date.UTC(ano, mes - 1, dia);
}

function utcAIso(ms: number): string {
    return new Date(ms).toISOString().slice(0, 10);
}

/** Vencimiento según el plazo de la empresa (YYYY-MM-DD). */
export function vencimientoPorPlazo(fechaEmision: string, plazo: PlazoEmpresa): string {
    const [ano, mes, dia] = fechaEmision.split("-").map(Number) as [number, number, number];

    if (plazo.tipo === "DIAS") return utcAIso(isoAUtc(fechaEmision) + plazo.dias * MS_DIA);
    if (dia === 1) return fechaEmision;

    return utcAIso(Date.UTC(ano, mes, 1)); // mes es 1-12: Date.UTC(ano, mes, 1) = día 1 del mes siguiente
}

/* =========================================================
   NC SIN XML (inferencia RUT + monto)

   BaseAPI no tiene el XML de algunas NC antiguas (404), así que no
   se sabe a qué factura apuntan. Regla (decisión 17-11-2026):
   - Grupo = mismo RUT + mismo monto.
   - Candidatas: facturas 33/34 abiertas (no conciliadas, sin otra
     NC aplicada), con saldo = monto y emitidas el mismo día o antes
     que la NC.
   - Solo se infiere si en el grupo hay tantas candidatas como NC
     (calce único o par a par). Se asigna en orden de fecha.
   - Se omiten NC del mismo RUT y monto que una ND del RCV
     (probable reversa de la NC).
   ========================================================= */

type NcSinXml = { folio: string; rut: string; monto: number; fecha: string };
type FacturaCandidata = { key: string; tipoDoc: string; folio: string; rut: string; monto: number; fecha: string };

export function inferirNotasCreditoSinXml(ncs: NcSinXml[], facturas: FacturaCandidata[]) {
    const asignaciones: Array<{ nc: NcSinXml; factura: FacturaCandidata }> = [];
    const grupo = (rut: string, monto: number) => `${rut}|${monto}`;

    const ncPorGrupo = new Map<string, NcSinXml[]>();
    for (const nc of ncs) {
        const lista = ncPorGrupo.get(grupo(nc.rut, nc.monto)) ?? [];
        lista.push(nc);
        ncPorGrupo.set(grupo(nc.rut, nc.monto), lista);
    }

    for (const [clave, ncsGrupo] of ncPorGrupo) {
        const candidatas = facturas
            .filter((f) => grupo(f.rut, f.monto) === clave)
            .sort((a, b) => a.fecha.localeCompare(b.fecha) || Number(a.folio) - Number(b.folio));

        if (candidatas.length !== ncsGrupo.length) continue;

        const usadas = new Set<string>();
        const propuestas: Array<{ nc: NcSinXml; factura: FacturaCandidata }> = [];

        for (const nc of ncsGrupo.slice().sort((a, b) => a.fecha.localeCompare(b.fecha) || Number(a.folio) - Number(b.folio))) {
            const factura = candidatas.find((f) => !usadas.has(f.key) && f.fecha <= nc.fecha);
            if (!factura) break;
            usadas.add(factura.key);
            propuestas.push({ nc, factura });
        }

        // Todo o nada por grupo.
        if (propuestas.length === ncsGrupo.length) asignaciones.push(...propuestas);
    }

    return asignaciones;
}

/* =========================================================
   CACHES RCV
   ========================================================= */

async function cargarDocumentosRcv(empresaKey: EmpresaKey, desdeAno?: number) {
    const caches = await prisma.siiApiCache.findMany({
        where: {
            empresaKey,
            tipo: { in: ["ventas", "baseapi-rcv-ventas"] },
        },
        select: { mes: true, ano: true, tipo: true, data: true, updatedAt: true },
    });

    // Un cache por año-mes: prioriza "baseapi-rcv-ventas" y luego el más reciente.
    const porPeriodo = new Map<string, (typeof caches)[number]>();

    for (const cache of caches) {
        const ano = Number(cache.ano);
        const mes = Number(cache.mes);
        if (!Number.isInteger(ano) || !Number.isInteger(mes) || mes < 1 || mes > 12) continue;
        if (desdeAno !== undefined && ano < desdeAno) continue;

        const periodo = `${ano}-${String(mes).padStart(2, "0")}`;
        const existente = porPeriodo.get(periodo);

        if (!existente) {
            porPeriodo.set(periodo, cache);
            continue;
        }

        const prioridad = (tipo: string) => (tipo === "baseapi-rcv-ventas" ? 2 : 1);

        if (
            prioridad(cache.tipo) > prioridad(existente.tipo) ||
            (prioridad(cache.tipo) === prioridad(existente.tipo) && cache.updatedAt > existente.updatedAt)
        ) {
            porPeriodo.set(periodo, cache);
        }
    }

    const periodos = Array.from(porPeriodo.keys()).sort();
    const documentos: any[] = [];

    for (const periodo of periodos) {
        const cache = porPeriodo.get(periodo);
        if (!cache) continue;

        for (const doc of getDocumentosVentas(cache.data)) {
            // Copia: obtenerEstadosDocumentosCobranza anota campos sobre el documento.
            documentos.push({ ...doc, empresaOrigen: empresaKey, periodoCobranzaOrigen: periodo });
        }
    }

    return { periodos, documentos };
}

/* =========================================================
   DOCUMENTOS
   ========================================================= */

export async function obtenerDocumentosCxc(params: {
    empresaKey: EmpresaKey;
    desdeAno?: number;
    consultaSii?: boolean;
    referencia?: Date;
}): Promise<ResultadoDocumentosCxc> {
    const { empresaKey, desdeAno, consultaSii = false, referencia = new Date() } = params;
    const hoy = fechaChileIso(referencia);

    const { periodos, documentos: rcv } = await cargarDocumentosRcv(empresaKey, desdeAno);

    /* ---------- Deduplicar por tipo|folio|rut ---------- */

    const vistos = new Set<string>();
    const unicos: any[] = [];
    let duplicadosOmitidos = 0;

    for (const doc of rcv) {
        const key = claveDocumento(getTipoDoc(doc), getFolio(doc), getRut(doc));
        if (vistos.has(key)) {
            duplicadosOmitidos++;
            continue;
        }
        vistos.add(key);
        unicos.push(doc);
    }

    /* ---------- NC / ND (sobre todo el RCV, incluye las 61) ---------- */

    const { aplicaciones, notasDebitoSoloReversa } = await obtenerAplicacionesNotasCredito({
        empresa: empresaKey,
        documentos: unicos,
        consultaSiiActiva: consultaSii,
    });

    /* ---------- Documentos cobrables ---------- */

    let ndSoloReversa = 0;

    const cobrables = unicos.filter((doc) => {
        const tipoDoc = getTipoDoc(doc);
        if (!TIPOS_COBRABLES.has(tipoDoc) || !getFolio(doc) || !getRut(doc)) return false;

        if (tipoDoc === "56" && notasDebitoSoloReversa.has([getFolio(doc), getRut(doc)].join("|"))) {
            ndSoloReversa++;
            return false;
        }

        return true;
    });

    /* ---------- Vencimientos (una sola llamada) ---------- */

    const evaluados = await obtenerEstadosDocumentosCobranza(cobrables, "ventas", empresaKey);

    /* ---------- Conciliaciones (fecha y forma de pago) ---------- */

    const conciliaciones = await prisma.rcvConciliacion.findMany({
        where: { empresaKey, tipoRcv: "ventas", estadoConciliacion: "CONCILIADA" },
        select: { tipoDoc: true, folio: true, rutContraparte: true, conciliadoAt: true, formaPago: true },
        orderBy: { conciliadoAt: "desc" },
    });

    const conciliacionPorKey = new Map<string, (typeof conciliaciones)[number]>();

    for (const c of conciliaciones) {
        const key = claveDocumento(c.tipoDoc.trim(), c.folio.trim(), normalizarRut(c.rutContraparte));
        if (!conciliacionPorKey.has(key)) conciliacionPorKey.set(key, c);
    }

    /* ---------- Abonos (pagos parciales o totales, Fase 4a) ---------- */

    const abonosBd = await prisma.rcvAbono.findMany({
        where: { empresaKey, tipoRcv: "ventas" },
        select: { tipoDoc: true, folio: true, rutContraparte: true, monto: true, fechaPago: true, formaPago: true },
        orderBy: { fechaPago: "asc" },
    });

    const abonosPorKey = new Map<string, { total: number; cantidad: number; ultimaFecha: Date; ultimaForma: string | null }>();

    for (const a of abonosBd) {
        const key = claveDocumento(a.tipoDoc.trim(), a.folio.trim(), normalizarRut(a.rutContraparte));
        const actual = abonosPorKey.get(key);
        abonosPorKey.set(key, {
            total: (actual?.total ?? 0) + a.monto,
            cantidad: (actual?.cantidad ?? 0) + 1,
            ultimaFecha: a.fechaPago,
            ultimaForma: a.formaPago,
        });
    }

    /* ---------- Origen de los vencimientos guardados (RcvVencimiento) ---------- */

    const plazo = PLAZO_EMPRESA[empresaKey];

    const origenVencimientoBd = new Map(
        (
            await prisma.rcvVencimiento.findMany({
                where: { empresaKey },
                select: { tipoDoc: true, folio: true, origenVencimiento: true },
            })
        ).map((v) => [`${v.tipoDoc}|${v.folio}`, v.origenVencimiento]),
    );

    /** Vencimiento final: el de cobranza o el plazo de la empresa según las reglas de PLAZO_EMPRESA. */
    const resolverVencimiento = (
        documento: any,
        estadoCobranza: { fechaVencimientoIso: string | null; diasDiferencia: number | null; origenVencimiento: string },
    ) => {
        const fechaEmision = fechaEmisionIso(documento);
        const origenBd = origenVencimientoBd.get(`${getTipoDoc(documento)}|${getFolio(documento)}`);

        const reemplazar =
            Boolean(fechaEmision) &&
            (!estadoCobranza.fechaVencimientoIso ||
                (plazo.prioritario &&
                    (estadoCobranza.origenVencimiento === "RECEPTOR_COBRANZA" ||
                        estadoCobranza.origenVencimiento === "DETALLE_EMPRESA" ||
                        (estadoCobranza.origenVencimiento === "OVERRIDE" && origenBd === "DIAS_CREDITO"))));

        if (!reemplazar || !fechaEmision) {
            return {
                fechaIso: estadoCobranza.fechaVencimientoIso,
                dias: estadoCobranza.diasDiferencia,
                origen: estadoCobranza.origenVencimiento === "OVERRIDE" && origenBd ? `OVERRIDE_${origenBd}` : estadoCobranza.origenVencimiento,
            };
        }

        const fechaIso = vencimientoPorPlazo(fechaEmision, plazo);
        return { fechaIso, dias: Math.round((isoAUtc(hoy) - isoAUtc(fechaIso)) / MS_DIA), origen: "PLAZO_EMPRESA" };
    };

    const vencimientoPagada = (
        documento: any,
        estadoSinConciliar: { fechaVencimientoIso: string | null; diasDiferencia: number | null; origenVencimiento: string } | undefined,
    ) =>
        resolverVencimiento(documento, estadoSinConciliar ?? { fechaVencimientoIso: null, diasDiferencia: null, origenVencimiento: "SIN_FECHA" })
            .fechaIso;

    /* ---------- NC sin XML: inferencia RUT + monto ---------- */

    const ncConAplicacion = new Set<string>();
    for (const aplicacion of aplicaciones.values()) {
        for (const nc of aplicacion.notasCredito) ncConAplicacion.add([nc.folio, aplicacion.rutContraparte].join("|"));
    }

    const ncsRcv = unicos.filter((doc) => getTipoDoc(doc) === "61" && getFolio(doc) && getRut(doc));
    const foliosNc = Array.from(new Set(ncsRcv.map((doc) => Number(getFolio(doc))).filter(Number.isFinite)));

    const ncConXml = new Set(
        (
            await prisma.facturaDTE.findMany({
                where: { empresaAlias: empresaKey, tipoDTE: 61, folio: { in: foliosNc }, xmlRaw: { not: null } },
                select: { folio: true },
            })
        ).map((f) => String(f.folio)),
    );

    const ndRutMonto = new Set(unicos.filter((doc) => getTipoDoc(doc) === "56").map((doc) => `${getRut(doc)}|${getMontoTotal(doc)}`));

    const ncCandidatas: NcSinXml[] = ncsRcv
        .filter((doc) => !ncConXml.has(getFolio(doc)) && !ncConAplicacion.has([getFolio(doc), getRut(doc)].join("|")))
        .filter((doc) => !ndRutMonto.has(`${getRut(doc)}|${getMontoTotal(doc)}`))
        .map((doc) => ({ folio: getFolio(doc), rut: getRut(doc), monto: getMontoTotal(doc), fecha: fechaEmisionIso(doc) ?? String(doc?.periodoCobranzaOrigen ?? "") }));

    const facturasCandidatas: FacturaCandidata[] = evaluados
        .map(({ documento }) => documento)
        .filter((doc) => getTipoDoc(doc) === "33" || getTipoDoc(doc) === "34")
        .map((doc) => {
            const tipoDoc = getTipoDoc(doc);
            const folio = getFolio(doc);
            const rut = getRut(doc);
            return { key: claveDocumento(tipoDoc, folio, rut), tipoDoc, folio, rut, monto: getMontoTotal(doc), fecha: fechaEmisionIso(doc) ?? "" };
        })
        .filter((f) => f.fecha && !aplicaciones.has(f.key) && !conciliacionPorKey.has(f.key));

    const ncInferidas: DiagnosticoCxc["ncInferidas"] = [];

    for (const { nc, factura } of inferirNotasCreditoSinXml(ncCandidatas, facturasCandidatas)) {
        aplicaciones.set(factura.key, {
            tipoDoc: factura.tipoDoc,
            folio: factura.folio,
            rutContraparte: factura.rut,
            anulaCompletamente: false,
            montoNotasCredito: nc.monto,
            notasCredito: [{ folio: nc.folio, montoTotal: nc.monto, codigoRef: null, razonRef: "INFERIDA (RUT + monto, sin XML)" }],
        });
        ncInferidas.push({ nc: `61-${nc.folio}`, factura: `${factura.tipoDoc}-${factura.folio}`, rut: nc.rut, monto: nc.monto });
    }

    /* ---------- Vencimiento pactado de las pagadas (comportamiento de pago) ---------- */

    // cobranza-estado no calcula el vencimiento de las conciliadas: se pide aparte ignorando la conciliación.
    const pagadas = evaluados
        .filter(
            ({ documento, estado: e }) =>
                e.conciliada || conciliacionPorKey.has(claveDocumento(getTipoDoc(documento), getFolio(documento), getRut(documento))),
        )
        .map(({ documento }) => ({ ...documento }));

    const estadoPagadas = new Map<string, (typeof evaluados)[number]["estado"]>();

    if (pagadas.length > 0) {
        const evaluadasPagadas = await obtenerEstadosDocumentosCobranza(pagadas, "ventas", empresaKey, { ignorarConciliacion: true });
        for (const { documento, estado: e } of evaluadasPagadas) {
            estadoPagadas.set(claveDocumento(getTipoDoc(documento), getFolio(documento), getRut(documento)), e);
        }
    }

    /* ---------- Estado por documento ---------- */

    const documentos: DocumentoCxc[] = [];
    const emparejadas = new Set<string>();
    const origenVencimiento: Record<string, number> = {};
    let compensados = 0;
    let sinVencimiento = 0;
    let plazoEmpresa = 0;

    for (const { documento, estado: estadoCobranza } of evaluados) {
        const tipoDoc = getTipoDoc(documento);
        const folio = getFolio(documento);
        const rutContraparte = getRut(documento);
        const key = claveDocumento(tipoDoc, folio, rutContraparte);

        const montoOriginal = getMontoTotal(documento);
        const aplicacion = aplicaciones.get(key);
        const montoNotasCredito = aplicacion?.anulaCompletamente ? montoOriginal : (aplicacion?.montoNotasCredito ?? 0);
        const saldoNc = Math.max(0, montoOriginal - montoNotasCredito);
        const abonosDoc = abonosPorKey.get(key);
        const montoAbonado = abonosDoc?.total ?? 0;
        const pagadoConAbonos = saldoNc > 0 && montoAbonado >= saldoNc;

        const conciliacion = conciliacionPorKey.get(key);
        if (conciliacion) emparejadas.add(key);

        const venc = resolverVencimiento(documento, estadoCobranza);

        let estado: EstadoCxc;

        if (aplicacion?.anulaCompletamente || (montoOriginal > 0 && saldoNc <= 0)) {
            estado = "COMPENSADO";
            compensados++;
        } else if (conciliacion || estadoCobranza.conciliada || pagadoConAbonos) {
            estado = "PAGADO";
        } else if (venc.dias !== null && venc.dias > 0) {
            estado = "VENCIDO";
        } else {
            estado = "PENDIENTE";
        }

        const abierto = estado === "PENDIENTE" || estado === "VENCIDO";
        const origen = abierto ? venc.origen : "-";
        const saldo = abierto ? Math.max(0, saldoNc - montoAbonado) : saldoNc;

        if (abierto) {
            origenVencimiento[origen] = (origenVencimiento[origen] ?? 0) + 1;
            if (!venc.fechaIso) sinVencimiento++;
            if (venc.origen === "PLAZO_EMPRESA") plazoEmpresa++;
        }

        documentos.push({
            key,
            tipoDoc,
            folio,
            rutContraparte,
            razonSocial: getRazonSocial(documento),
            periodo: String(documento?.periodoCobranzaOrigen ?? ""),
            fechaEmision: fechaEmisionIso(documento),
            montoOriginal,
            montoNotasCredito,
            saldo,
            montoAbonado,
            abonos: abonosDoc?.cantidad ?? 0,
            notasCredito: aplicacion?.notasCredito ?? [],
            estado,
            fechaVencimiento: abierto ? venc.fechaIso : null,
            origenVencimiento: origen,
            diasDiferencia: abierto ? venc.dias : null,
            // Sin vencimiento no entra en la antigüedad (se informa aparte).
            tramo: abierto && !venc.fechaIso ? null : tramoDe(estado, venc.dias),
            pagadoAt:
                estado !== "PAGADO"
                    ? null
                    : conciliacion?.conciliadoAt
                        ? fechaChileIso(conciliacion.conciliadoAt)
                        : abonosDoc
                            ? fechaChileIso(abonosDoc.ultimaFecha)
                            : null,
            vencimientoPactado: estado === "PAGADO" ? vencimientoPagada(documento, estadoPagadas.get(key)) : null,
            formaPago: estado === "PAGADO" ? (conciliacion?.formaPago ?? abonosDoc?.ultimaForma ?? null) : null,
        });
    }

    const conciliadasSinDocumento = Array.from(conciliacionPorKey.keys()).filter((key) => !emparejadas.has(key));

    const ncAplicadas = new Set<string>();
    for (const aplicacion of aplicaciones.values()) {
        for (const nc of aplicacion.notasCredito) ncAplicadas.add([nc.folio, aplicacion.rutContraparte].join("|"));
    }

    const ncSinAplicar = unicos
        .filter((doc) => getTipoDoc(doc) === "61" && !ncAplicadas.has([getFolio(doc), getRut(doc)].join("|")))
        .map((doc) => ({
            folio: getFolio(doc),
            periodo: String(doc?.periodoCobranzaOrigen ?? ""),
            rut: getRut(doc),
            razonSocial: getRazonSocial(doc),
            fechaEmision: fechaEmisionIso(doc),
            monto: getMontoTotal(doc),
        }));

    /* ---------- Notas de crédito y débito ---------- */

    const aplicacionPorNc = new Map<string, { factura: string; metodo: "XML" | "INFERIDA" }>();
    for (const aplicacion of aplicaciones.values()) {
        for (const nc of aplicacion.notasCredito) {
            aplicacionPorNc.set(`${nc.folio}|${aplicacion.rutContraparte}`, {
                factura: `${aplicacion.tipoDoc}-${aplicacion.folio}`,
                metodo: String(nc.razonRef ?? "").startsWith("INFERIDA") ? "INFERIDA" : "XML",
            });
        }
    }

    const notas: NotaCxc[] = unicos
        .filter((doc) => getTipoDoc(doc) === "61" || getTipoDoc(doc) === "56")
        .map((doc) => {
            const tipoDoc = getTipoDoc(doc) as "61" | "56";
            const folio = getFolio(doc);
            const rut = getRut(doc);
            const aplicada = tipoDoc === "61" ? aplicacionPorNc.get(`${folio}|${rut}`) : undefined;

            const metodo: NotaCxc["metodo"] =
                tipoDoc === "56"
                    ? notasDebitoSoloReversa.has(`${folio}|${rut}`)
                        ? "ND_REVERSA"
                        : "ND_COBRABLE"
                    : (aplicada?.metodo ?? "SIN_APLICAR");

            return {
                tipoDoc,
                folio,
                rutContraparte: rut,
                razonSocial: getRazonSocial(doc),
                periodo: String(doc?.periodoCobranzaOrigen ?? ""),
                fechaEmision: fechaEmisionIso(doc),
                monto: getMontoTotal(doc),
                aplicadaA: aplicada?.factura ?? null,
                metodo,
            };
        })
        .sort((a, b) => String(b.fechaEmision).localeCompare(String(a.fechaEmision)));

    return {
        empresaKey,
        hoy,
        documentos,
        notas,
        diagnostico: {
            periodosLeidos: periodos,
            documentosRcv: rcv.length,
            duplicadosOmitidos,
            documentosCobrables: cobrables.length,
            notasCreditoEnRcv: unicos.filter((doc) => getTipoDoc(doc) === "61").length,
            facturasConNc: aplicaciones.size,
            compensados,
            ndSoloReversa,
            conciliadasEnBd: conciliacionPorKey.size,
            conciliadasEmparejadas: emparejadas.size,
            conciliadasSinDocumento: conciliadasSinDocumento.slice(0, 50),
            sinVencimiento,
            origenVencimiento,
            plazoEmpresa,
            ncInferidas,
            ncSinAplicar,
        },
    };
}

/* =========================================================
   RESUMEN
   ========================================================= */

const ETIQUETAS_TRAMO: Record<TramoAntiguedad, string> = {
    AL_DIA: "Dentro de plazo",
    "1_30": "1–30 días",
    "31_60": "31–60 días",
    "61_90": "61–90 días",
    MAS_90: "Más de 90 días",
};

function sumar(destino: Monto, monto: number) {
    destino.monto += monto;
    destino.documentos += 1;
}

function periodosAnteriores(hoy: string, meses: number): string[] {
    const [ano, mes] = hoy.split("-").map(Number) as [number, number];
    const lista: string[] = [];

    for (let i = meses - 1; i >= 0; i--) {
        const fecha = new Date(Date.UTC(ano, mes - 1 - i, 1));
        lista.push(`${fecha.getUTCFullYear()}-${String(fecha.getUTCMonth() + 1).padStart(2, "0")}`);
    }

    return lista;
}

export async function obtenerResumenCxc(params: {
    empresaKey: EmpresaKey;
    desdeAno?: number;
    consultaSii?: boolean;
    meses?: number;
    referencia?: Date;
}): Promise<ResumenCxc & { documentos: DocumentoCxc[]; notas: NotaCxc[] }> {
    const { meses = 12, ...resto } = params;
    const { empresaKey, hoy, documentos, notas, diagnostico } = await obtenerDocumentosCxc(resto);

    const mesActual = hoy.slice(0, 7);
    const nuevo = (): Monto => ({ monto: 0, documentos: 0 });

    const tarjetas = {
        pagosMes: nuevo(),
        porVencer: nuevo(),
        vencido: nuevo(),
        sinVencimiento: nuevo(),
        total: nuevo(),
    };

    const tramos = new Map<TramoAntiguedad, Monto>(
        (Object.keys(ETIQUETAS_TRAMO) as TramoAntiguedad[]).map((tramo) => [tramo, nuevo()]),
    );

    const periodosBarras = periodosAnteriores(hoy, meses);
    const barras = new Map(periodosBarras.map((periodo) => [periodo, { periodo, pagado: 0, porVencer: 0, vencido: 0 }]));
    const proyeccion = new Map<string, Monto>();

    for (const doc of documentos) {
        if (doc.estado === "PAGADO" && doc.pagadoAt?.startsWith(mesActual)) {
            sumar(tarjetas.pagosMes, doc.saldo);
        }

        if (doc.estado === "VENCIDO") {
            sumar(tarjetas.vencido, doc.saldo);
        } else if (doc.estado === "PENDIENTE") {
            sumar(doc.fechaVencimiento ? tarjetas.porVencer : tarjetas.sinVencimiento, doc.saldo);
        }

        if (doc.estado === "VENCIDO" || doc.estado === "PENDIENTE") {
            sumar(tarjetas.total, doc.saldo);

            const tramo = doc.tramo ? tramos.get(doc.tramo) : undefined;
            if (tramo) sumar(tramo, doc.saldo);

            const periodoProyeccion = doc.estado === "VENCIDO" ? "VENCIDO" : (doc.fechaVencimiento?.slice(0, 7) ?? "SIN_FECHA");
            const destino = proyeccion.get(periodoProyeccion) ?? nuevo();
            sumar(destino, doc.saldo);
            proyeccion.set(periodoProyeccion, destino);
        }

        const barra = barras.get((doc.fechaEmision ?? doc.periodo).slice(0, 7));
        if (barra) {
            if (doc.estado === "PAGADO") barra.pagado += doc.saldo;
            else if (doc.estado === "PENDIENTE") barra.porVencer += doc.saldo;
            else if (doc.estado === "VENCIDO") barra.vencido += doc.saldo;
        }
    }

    const ordenProyeccion = (periodo: string) => (periodo === "VENCIDO" ? "0" : periodo === "SIN_FECHA" ? "9" : periodo);

    return {
        empresaKey,
        hoy,
        tarjetas,
        antiguedad: Array.from(tramos.entries()).map(([tramo, monto]) => ({ tramo, etiqueta: ETIQUETAS_TRAMO[tramo], ...monto })),
        porMesEmision: Array.from(barras.values()),
        proyeccion: Array.from(proyeccion.entries())
            .sort(([a], [b]) => ordenProyeccion(a).localeCompare(ordenProyeccion(b)))
            .map(([periodo, monto]) => ({ periodo, ...monto })),
        diagnostico,
        documentos,
        notas,
    };
}