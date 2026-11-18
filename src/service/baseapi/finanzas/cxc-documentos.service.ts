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

export type TramoAntiguedad = "AL_DIA" | "1_15" | "16_30" | "31_60" | "61_90" | "MAS_90";

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
    /** Monto original menos NC (lo que se cobra). */
    saldo: number;
    notasCredito: NotaCreditoAplicada[];
    estado: EstadoCxc;
    fechaVencimiento: string | null;
    origenVencimiento: string;
    /** Convención de cobranza: >0 días vencido, <=0 faltan días. */
    diasDiferencia: number | null;
    tramo: TramoAntiguedad | null;
    pagadoAt: string | null;
    formaPago: string | null;
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
    ncSinAplicar: Array<{ folio: string; periodo: string; rut: string; razonSocial: string | null; fechaEmision: string | null; monto: number }>;
};

export type ResultadoDocumentosCxc = {
    empresaKey: EmpresaKey;
    hoy: string;
    documentos: DocumentoCxc[];
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
    if (dias <= 15) return "1_15";
    if (dias <= 30) return "16_30";
    if (dias <= 60) return "31_60";
    if (dias <= 90) return "61_90";
    return "MAS_90";
}

function claveDocumento(tipoDoc: string, folio: string, rut: string): string {
    return [tipoDoc, folio, rut].join("|");
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

    /* ---------- Estado por documento ---------- */

    const documentos: DocumentoCxc[] = [];
    const emparejadas = new Set<string>();
    const origenVencimiento: Record<string, number> = {};
    let compensados = 0;
    let sinVencimiento = 0;

    for (const { documento, estado: estadoCobranza } of evaluados) {
        const tipoDoc = getTipoDoc(documento);
        const folio = getFolio(documento);
        const rutContraparte = getRut(documento);
        const key = claveDocumento(tipoDoc, folio, rutContraparte);

        const montoOriginal = getMontoTotal(documento);
        const aplicacion = aplicaciones.get(key);
        const montoNotasCredito = aplicacion?.anulaCompletamente ? montoOriginal : (aplicacion?.montoNotasCredito ?? 0);
        const saldo = Math.max(0, montoOriginal - montoNotasCredito);

        const conciliacion = conciliacionPorKey.get(key);
        if (conciliacion) emparejadas.add(key);

        let estado: EstadoCxc;

        if (aplicacion?.anulaCompletamente || (montoOriginal > 0 && saldo <= 0)) {
            estado = "COMPENSADO";
            compensados++;
        } else if (conciliacion || estadoCobranza.conciliada) {
            estado = "PAGADO";
        } else if (estadoCobranza.diasDiferencia !== null && estadoCobranza.diasDiferencia > 0) {
            estado = "VENCIDO";
        } else {
            estado = "PENDIENTE";
        }

        const abierto = estado === "PENDIENTE" || estado === "VENCIDO";
        const origen = abierto ? estadoCobranza.origenVencimiento : "-";

        if (abierto) {
            origenVencimiento[origen] = (origenVencimiento[origen] ?? 0) + 1;
            if (!estadoCobranza.fechaVencimientoIso) sinVencimiento++;
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
            notasCredito: aplicacion?.notasCredito ?? [],
            estado,
            fechaVencimiento: abierto ? estadoCobranza.fechaVencimientoIso : null,
            origenVencimiento: origen,
            diasDiferencia: abierto ? estadoCobranza.diasDiferencia : null,
            // Sin vencimiento no entra en la antigüedad (se informa aparte).
            tramo: abierto && !estadoCobranza.fechaVencimientoIso ? null : tramoDe(estado, estadoCobranza.diasDiferencia),
            pagadoAt: estado === "PAGADO" && conciliacion?.conciliadoAt ? fechaChileIso(conciliacion.conciliadoAt) : null,
            formaPago: estado === "PAGADO" ? (conciliacion?.formaPago ?? null) : null,
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

    return {
        empresaKey,
        hoy,
        documentos,
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
            ncSinAplicar,
        },
    };
}

/* =========================================================
   RESUMEN
   ========================================================= */

const ETIQUETAS_TRAMO: Record<TramoAntiguedad, string> = {
    AL_DIA: "Dentro de plazo",
    "1_15": "1–15 días",
    "16_30": "16–30 días",
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
}): Promise<ResumenCxc & { documentos: DocumentoCxc[] }> {
    const { meses = 12, ...resto } = params;
    const { empresaKey, hoy, documentos, diagnostico } = await obtenerDocumentosCxc(resto);

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
    };
}