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
import { obtenerEstadosDocumentosCobranza, } from "../cobranza/cobranza-estado.service.js";
import { obtenerAplicacionesNotasCredito, } from "../cobranza/cobranza-notas-credito.service.js";
/* =========================================================
   HELPERS
   ========================================================= */
const TIPOS_COBRABLES = new Set(["33", "34", "56"]);
const ZONA = "America/Santiago";
function fechaChileIso(fecha) {
    // en-CA = YYYY-MM-DD
    return new Intl.DateTimeFormat("en-CA", {
        timeZone: ZONA,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
    }).format(fecha);
}
function normalizarRut(value) {
    return String(value ?? "")
        .replace(/[^0-9kK]/g, "")
        .toUpperCase();
}
function getDocumentosVentas(data) {
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
        if (Array.isArray(candidato))
            return candidato;
    }
    return [];
}
function getTipoDoc(doc) {
    return String(doc?.["Tipo Doc"] ?? doc?.tipoDoc ?? doc?.tipoDTE ?? "").trim();
}
function getFolio(doc) {
    return String(doc?.["Folio"] ?? doc?.folio ?? doc?.Nro ?? doc?.numero ?? "").trim();
}
/** Mismas claves que cobranza-notas-credito / cobranza-automatico. */
function getRut(doc) {
    return normalizarRut(doc?.["Rut cliente"] ??
        doc?.["RUT Cliente"] ??
        doc?.["Rut Receptor"] ??
        doc?.["RUT Receptor"] ??
        doc?.rutCliente ??
        doc?.rutReceptor ??
        doc?.rut ??
        doc?.RUT ??
        "");
}
function getRazonSocial(doc) {
    const value = doc?.["Razon Social"] ?? doc?.["Razón Social"] ?? doc?.razonSocial ?? null;
    const texto = value === null || value === undefined ? "" : String(value).trim();
    return texto || null;
}
function toNumberCL(value) {
    if (typeof value === "number")
        return Number.isFinite(value) ? value : 0;
    const raw = String(value ?? "").replace(/\$/g, "").replace(/\s/g, "").trim();
    if (!raw)
        return 0;
    const numero = Number(raw.replace(/\./g, "").replace(",", "."));
    return Number.isFinite(numero) ? numero : 0;
}
function getMontoTotal(doc) {
    return Math.round(toNumberCL(doc?.["Monto total"] ?? doc?.["Monto Total"] ?? doc?.montoTotal ?? doc?.total ?? 0));
}
/** YYYY-MM-DD desde DD/MM/YYYY, YYYY-MM-DD o ISO con hora. */
function fechaEmisionIso(doc) {
    const raw = String(doc?.["Fecha Docto"] ??
        doc?.["Fecha Documento"] ??
        doc?.["Fecha Emisión"] ??
        doc?.["Fecha Emision"] ??
        doc?.fechaDocto ??
        doc?.fechaDocumento ??
        doc?.fechaEmision ??
        doc?.FchEmis ??
        "").trim();
    if (!raw)
        return null;
    const latina = raw.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
    if (latina)
        return `${latina[3]}-${latina[2]}-${latina[1]}`;
    const iso = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (iso)
        return `${iso[1]}-${iso[2]}-${iso[3]}`;
    return null;
}
function tramoDe(estado, dias) {
    if (estado === "PENDIENTE")
        return "AL_DIA";
    if (estado !== "VENCIDO" || dias === null)
        return null;
    if (dias <= 30)
        return "1_30";
    if (dias <= 60)
        return "31_60";
    if (dias <= 90)
        return "61_90";
    return "MAS_90";
}
function claveDocumento(tipoDoc, folio, rut) {
    return [tipoDoc, folio, rut].join("|");
}
export const PLAZO_EMPRESA = {
    rids: { tipo: "DIAS", dias: 30, prioritario: false },
    econnet: { tipo: "DIA_1_MES_SIGUIENTE", prioritario: true },
};
const MS_DIA = 86_400_000;
function isoAUtc(iso) {
    const [ano, mes, dia] = iso.split("-").map(Number);
    return Date.UTC(ano, mes - 1, dia);
}
function utcAIso(ms) {
    return new Date(ms).toISOString().slice(0, 10);
}
/** Vencimiento según el plazo de la empresa (YYYY-MM-DD). */
export function vencimientoPorPlazo(fechaEmision, plazo) {
    const [ano, mes, dia] = fechaEmision.split("-").map(Number);
    if (plazo.tipo === "DIAS")
        return utcAIso(isoAUtc(fechaEmision) + plazo.dias * MS_DIA);
    if (dia === 1)
        return fechaEmision;
    return utcAIso(Date.UTC(ano, mes, 1)); // mes es 1-12: Date.UTC(ano, mes, 1) = día 1 del mes siguiente
}
export function inferirNotasCreditoSinXml(ncs, facturas) {
    const asignaciones = [];
    const grupo = (rut, monto) => `${rut}|${monto}`;
    const ncPorGrupo = new Map();
    for (const nc of ncs) {
        const lista = ncPorGrupo.get(grupo(nc.rut, nc.monto)) ?? [];
        lista.push(nc);
        ncPorGrupo.set(grupo(nc.rut, nc.monto), lista);
    }
    for (const [clave, ncsGrupo] of ncPorGrupo) {
        const candidatas = facturas
            .filter((f) => grupo(f.rut, f.monto) === clave)
            .sort((a, b) => a.fecha.localeCompare(b.fecha) || Number(a.folio) - Number(b.folio));
        if (candidatas.length !== ncsGrupo.length)
            continue;
        const usadas = new Set();
        const propuestas = [];
        for (const nc of ncsGrupo.slice().sort((a, b) => a.fecha.localeCompare(b.fecha) || Number(a.folio) - Number(b.folio))) {
            const factura = candidatas.find((f) => !usadas.has(f.key) && f.fecha <= nc.fecha);
            if (!factura)
                break;
            usadas.add(factura.key);
            propuestas.push({ nc, factura });
        }
        // Todo o nada por grupo.
        if (propuestas.length === ncsGrupo.length)
            asignaciones.push(...propuestas);
    }
    return asignaciones;
}
/* =========================================================
   CACHES RCV
   ========================================================= */
async function cargarDocumentosRcv(empresaKey, desdeAno) {
    const caches = await prisma.siiApiCache.findMany({
        where: {
            empresaKey,
            tipo: { in: ["ventas", "baseapi-rcv-ventas"] },
        },
        select: { mes: true, ano: true, tipo: true, data: true, updatedAt: true },
    });
    // Un cache por año-mes: prioriza "baseapi-rcv-ventas" y luego el más reciente.
    const porPeriodo = new Map();
    for (const cache of caches) {
        const ano = Number(cache.ano);
        const mes = Number(cache.mes);
        if (!Number.isInteger(ano) || !Number.isInteger(mes) || mes < 1 || mes > 12)
            continue;
        if (desdeAno !== undefined && ano < desdeAno)
            continue;
        const periodo = `${ano}-${String(mes).padStart(2, "0")}`;
        const existente = porPeriodo.get(periodo);
        if (!existente) {
            porPeriodo.set(periodo, cache);
            continue;
        }
        const prioridad = (tipo) => (tipo === "baseapi-rcv-ventas" ? 2 : 1);
        if (prioridad(cache.tipo) > prioridad(existente.tipo) ||
            (prioridad(cache.tipo) === prioridad(existente.tipo) && cache.updatedAt > existente.updatedAt)) {
            porPeriodo.set(periodo, cache);
        }
    }
    const periodos = Array.from(porPeriodo.keys()).sort();
    const documentos = [];
    for (const periodo of periodos) {
        const cache = porPeriodo.get(periodo);
        if (!cache)
            continue;
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
export async function obtenerDocumentosCxc(params) {
    const { empresaKey, desdeAno, consultaSii = false, referencia = new Date() } = params;
    const hoy = fechaChileIso(referencia);
    const { periodos, documentos: rcv } = await cargarDocumentosRcv(empresaKey, desdeAno);
    /* ---------- Deduplicar por tipo|folio|rut ---------- */
    const vistos = new Set();
    const unicos = [];
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
        if (!TIPOS_COBRABLES.has(tipoDoc) || !getFolio(doc) || !getRut(doc))
            return false;
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
    const conciliacionPorKey = new Map();
    for (const c of conciliaciones) {
        const key = claveDocumento(c.tipoDoc.trim(), c.folio.trim(), normalizarRut(c.rutContraparte));
        if (!conciliacionPorKey.has(key))
            conciliacionPorKey.set(key, c);
    }
    /* ---------- Abonos (pagos parciales o totales, Fase 4a) ---------- */
    const abonosBd = await prisma.rcvAbono.findMany({
        where: { empresaKey, tipoRcv: "ventas" },
        select: { tipoDoc: true, folio: true, rutContraparte: true, monto: true, fechaPago: true, formaPago: true },
        orderBy: { fechaPago: "asc" },
    });
    const abonosPorKey = new Map();
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
    const origenVencimientoBd = new Map((await prisma.rcvVencimiento.findMany({
        where: { empresaKey },
        select: { tipoDoc: true, folio: true, origenVencimiento: true },
    })).map((v) => [`${v.tipoDoc}|${v.folio}`, v.origenVencimiento]));
    /** Vencimiento final: el de cobranza o el plazo de la empresa según las reglas de PLAZO_EMPRESA. */
    const resolverVencimiento = (documento, estadoCobranza) => {
        const fechaEmision = fechaEmisionIso(documento);
        const origenBd = origenVencimientoBd.get(`${getTipoDoc(documento)}|${getFolio(documento)}`);
        const reemplazar = Boolean(fechaEmision) &&
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
    const vencimientoPagada = (documento, estadoSinConciliar) => resolverVencimiento(documento, estadoSinConciliar ?? { fechaVencimientoIso: null, diasDiferencia: null, origenVencimiento: "SIN_FECHA" })
        .fechaIso;
    /* ---------- NC sin XML: inferencia RUT + monto ---------- */
    const ncConAplicacion = new Set();
    for (const aplicacion of aplicaciones.values()) {
        for (const nc of aplicacion.notasCredito)
            ncConAplicacion.add([nc.folio, aplicacion.rutContraparte].join("|"));
    }
    const ncsRcv = unicos.filter((doc) => getTipoDoc(doc) === "61" && getFolio(doc) && getRut(doc));
    const foliosNc = Array.from(new Set(ncsRcv.map((doc) => Number(getFolio(doc))).filter(Number.isFinite)));
    const ncConXml = new Set((await prisma.facturaDTE.findMany({
        where: { empresaAlias: empresaKey, tipoDTE: 61, folio: { in: foliosNc }, xmlRaw: { not: null } },
        select: { folio: true },
    })).map((f) => String(f.folio)));
    const ndRutMonto = new Set(unicos.filter((doc) => getTipoDoc(doc) === "56").map((doc) => `${getRut(doc)}|${getMontoTotal(doc)}`));
    const ncCandidatas = ncsRcv
        .filter((doc) => !ncConXml.has(getFolio(doc)) && !ncConAplicacion.has([getFolio(doc), getRut(doc)].join("|")))
        .filter((doc) => !ndRutMonto.has(`${getRut(doc)}|${getMontoTotal(doc)}`))
        .map((doc) => ({ folio: getFolio(doc), rut: getRut(doc), monto: getMontoTotal(doc), fecha: fechaEmisionIso(doc) ?? String(doc?.periodoCobranzaOrigen ?? "") }));
    const facturasCandidatas = evaluados
        .map(({ documento }) => documento)
        .filter((doc) => getTipoDoc(doc) === "33" || getTipoDoc(doc) === "34")
        .map((doc) => {
        const tipoDoc = getTipoDoc(doc);
        const folio = getFolio(doc);
        const rut = getRut(doc);
        return { key: claveDocumento(tipoDoc, folio, rut), tipoDoc, folio, rut, monto: getMontoTotal(doc), fecha: fechaEmisionIso(doc) ?? "" };
    })
        .filter((f) => f.fecha && !aplicaciones.has(f.key) && !conciliacionPorKey.has(f.key));
    const ncInferidas = [];
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
        .filter(({ documento, estado: e }) => e.conciliada || conciliacionPorKey.has(claveDocumento(getTipoDoc(documento), getFolio(documento), getRut(documento))))
        .map(({ documento }) => ({ ...documento }));
    const estadoPagadas = new Map();
    if (pagadas.length > 0) {
        const evaluadasPagadas = await obtenerEstadosDocumentosCobranza(pagadas, "ventas", empresaKey, { ignorarConciliacion: true });
        for (const { documento, estado: e } of evaluadasPagadas) {
            estadoPagadas.set(claveDocumento(getTipoDoc(documento), getFolio(documento), getRut(documento)), e);
        }
    }
    /* ---------- Estado por documento ---------- */
    const documentos = [];
    const emparejadas = new Set();
    const origenVencimiento = {};
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
        if (conciliacion)
            emparejadas.add(key);
        const venc = resolverVencimiento(documento, estadoCobranza);
        let estado;
        if (aplicacion?.anulaCompletamente || (montoOriginal > 0 && saldoNc <= 0)) {
            estado = "COMPENSADO";
            compensados++;
        }
        else if (conciliacion || estadoCobranza.conciliada || pagadoConAbonos) {
            estado = "PAGADO";
        }
        else if (venc.dias !== null && venc.dias > 0) {
            estado = "VENCIDO";
        }
        else {
            estado = "PENDIENTE";
        }
        const abierto = estado === "PENDIENTE" || estado === "VENCIDO";
        const origen = abierto ? venc.origen : "-";
        const saldo = abierto ? Math.max(0, saldoNc - montoAbonado) : saldoNc;
        if (abierto) {
            origenVencimiento[origen] = (origenVencimiento[origen] ?? 0) + 1;
            if (!venc.fechaIso)
                sinVencimiento++;
            if (venc.origen === "PLAZO_EMPRESA")
                plazoEmpresa++;
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
            pagadoAt: estado !== "PAGADO"
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
    const ncAplicadas = new Set();
    for (const aplicacion of aplicaciones.values()) {
        for (const nc of aplicacion.notasCredito)
            ncAplicadas.add([nc.folio, aplicacion.rutContraparte].join("|"));
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
    const aplicacionPorNc = new Map();
    for (const aplicacion of aplicaciones.values()) {
        for (const nc of aplicacion.notasCredito) {
            aplicacionPorNc.set(`${nc.folio}|${aplicacion.rutContraparte}`, {
                factura: `${aplicacion.tipoDoc}-${aplicacion.folio}`,
                metodo: String(nc.razonRef ?? "").startsWith("INFERIDA") ? "INFERIDA" : "XML",
            });
        }
    }
    const notas = unicos
        .filter((doc) => getTipoDoc(doc) === "61" || getTipoDoc(doc) === "56")
        .map((doc) => {
        const tipoDoc = getTipoDoc(doc);
        const folio = getFolio(doc);
        const rut = getRut(doc);
        const aplicada = tipoDoc === "61" ? aplicacionPorNc.get(`${folio}|${rut}`) : undefined;
        const metodo = tipoDoc === "56"
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
const ETIQUETAS_TRAMO = {
    AL_DIA: "Dentro de plazo",
    "1_30": "1–30 días",
    "31_60": "31–60 días",
    "61_90": "61–90 días",
    MAS_90: "Más de 90 días",
};
function sumar(destino, monto) {
    destino.monto += monto;
    destino.documentos += 1;
}
function periodosAnteriores(hoy, meses) {
    const [ano, mes] = hoy.split("-").map(Number);
    const lista = [];
    for (let i = meses - 1; i >= 0; i--) {
        const fecha = new Date(Date.UTC(ano, mes - 1 - i, 1));
        lista.push(`${fecha.getUTCFullYear()}-${String(fecha.getUTCMonth() + 1).padStart(2, "0")}`);
    }
    return lista;
}
export async function obtenerResumenCxc(params) {
    const { meses = 12, ...resto } = params;
    const { empresaKey, hoy, documentos, notas, diagnostico } = await obtenerDocumentosCxc(resto);
    const mesActual = hoy.slice(0, 7);
    const nuevo = () => ({ monto: 0, documentos: 0 });
    const tarjetas = {
        pagosMes: nuevo(),
        porVencer: nuevo(),
        vencido: nuevo(),
        sinVencimiento: nuevo(),
        total: nuevo(),
    };
    const tramos = new Map(Object.keys(ETIQUETAS_TRAMO).map((tramo) => [tramo, nuevo()]));
    const periodosBarras = periodosAnteriores(hoy, meses);
    const barras = new Map(periodosBarras.map((periodo) => [periodo, { periodo, pagado: 0, porVencer: 0, vencido: 0 }]));
    const proyeccion = new Map();
    for (const doc of documentos) {
        if (doc.estado === "PAGADO" && doc.pagadoAt?.startsWith(mesActual)) {
            sumar(tarjetas.pagosMes, doc.saldo);
        }
        if (doc.estado === "VENCIDO") {
            sumar(tarjetas.vencido, doc.saldo);
        }
        else if (doc.estado === "PENDIENTE") {
            sumar(doc.fechaVencimiento ? tarjetas.porVencer : tarjetas.sinVencimiento, doc.saldo);
        }
        if (doc.estado === "VENCIDO" || doc.estado === "PENDIENTE") {
            sumar(tarjetas.total, doc.saldo);
            const tramo = doc.tramo ? tramos.get(doc.tramo) : undefined;
            if (tramo)
                sumar(tramo, doc.saldo);
            const periodoProyeccion = doc.estado === "VENCIDO" ? "VENCIDO" : (doc.fechaVencimiento?.slice(0, 7) ?? "SIN_FECHA");
            const destino = proyeccion.get(periodoProyeccion) ?? nuevo();
            sumar(destino, doc.saldo);
            proyeccion.set(periodoProyeccion, destino);
        }
        const barra = barras.get((doc.fechaEmision ?? doc.periodo).slice(0, 7));
        if (barra) {
            if (doc.estado === "PAGADO")
                barra.pagado += doc.saldo;
            else if (doc.estado === "PENDIENTE")
                barra.porVencer += doc.saldo;
            else if (doc.estado === "VENCIDO")
                barra.vencido += doc.saldo;
        }
    }
    const ordenProyeccion = (periodo) => (periodo === "VENCIDO" ? "0" : periodo === "SIN_FECHA" ? "9" : periodo);
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
//# sourceMappingURL=cxc-documentos.service.js.map