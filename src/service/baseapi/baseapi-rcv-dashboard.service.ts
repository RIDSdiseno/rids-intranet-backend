// src/service/baseapi/baseapi-rcv-dashboard.service.ts
import { prisma } from "../../lib/prisma.js";
import type { EmpresaBaseApiKey } from "./baseapi.empresas.js";

export type TipoRcvDashboard = "ventas" | "compras";

type GetDashboardParams = {
    empresa: EmpresaBaseApiKey;
    mes: string | number;
    ano: string | number;
    tipo: TipoRcvDashboard;
};

function normalizarMes(mes: string | number): string {
    return String(mes).padStart(2, "0");
}

function normalizarAno(ano: string | number): string {
    return String(ano);
}

function getCacheTipo(tipo: TipoRcvDashboard) {
    return `baseapi-rcv-${tipo}`;
}

function getPayload(data: any) {
    return data?.data ?? data ?? {};
}

function getDocumentosFromCache(data: any): any[] {
    const payload = getPayload(data);
    if (Array.isArray(payload?.datos)) return payload.datos;
    if (Array.isArray(payload?.documentos)) return payload.documentos;
    if (Array.isArray(payload?.data)) return payload.data;
    return [];
}

function getValue(doc: any, keys: string[], fallback: any = null) {
    for (const key of keys) {
        const value = doc?.[key];
        if (value !== undefined && value !== null && value !== "") return value;
    }
    return fallback;
}

function toNumber(value: any): number {
    const clean = String(value ?? "0").replace(/\./g, "").replace(",", ".");
    const num = Number(clean);
    return Number.isFinite(num) ? num : 0;
}

function parseFechaDia(value: any): string {
    const raw = String(value ?? "").trim();
    if (!raw) return "Sin fecha";

    // BaseAPI formato "06/05/2026" o "06/05/2026 12:06:28"
    const match = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
    if (match) {
        const [, diaRaw, mesRaw, anoRaw] = match;
        if (!diaRaw || !mesRaw || !anoRaw) return "Sin fecha";
        return `${anoRaw}-${mesRaw.padStart(2, "0")}-${diaRaw.padStart(2, "0")}`;
    }

    // Formato ISO
    if (/^\d{4}-\d{2}-\d{2}/.test(raw)) return raw.slice(0, 10);

    return "Sin fecha";
}

function addToMap<T extends Record<string, any>>(
    map: Map<string, T>,
    key: string,
    initial: T,
    updater: (row: T) => void
) {
    const current = map.get(key) ?? initial;
    updater(current);
    map.set(key, current);
}

/**
 * Calcula el período anterior (mes - 1, ajustando año si es enero).
 */
function getPeriodoAnterior(mes: string, ano: string): { mes: string; ano: string } {
    const mesNum = Number(mes);
    if (mesNum === 1) {
        return { mes: "12", ano: String(Number(ano) - 1) };
    }
    return { mes: String(mesNum - 1).padStart(2, "0"), ano };
}

/**
 * Calcula el porcentaje de variación entre dos valores.
 * Devuelve null si no hay base de comparación.
 */
function calcularDeltaPct(actual: number, anterior: number): number | null {
    if (anterior === 0) return null;
    return Math.round(((actual - anterior) / anterior) * 100);
}

export async function getBaseApiRcvDashboard(params: GetDashboardParams) {
    const empresa = params.empresa;
    const mes = normalizarMes(params.mes);
    const ano = normalizarAno(params.ano);
    const tipo = params.tipo;
    const cacheTipo = getCacheTipo(tipo);

    // Claves de contraparte según tipo
    const contraparteRutKeys =
        tipo === "ventas"
            ? ["Rut cliente", "RUT Cliente", "rutCliente", "rutReceptor"]
            : ["RUT Proveedor", "Rut Proveedor", "rutProveedor"];

    const contraparteNombreKeys =
        tipo === "ventas"
            ? ["Razon Social", "Razón Social", "Razon Social Receptor", "razonSocial", "razonSocialReceptor"]
            : ["Razon Social", "Razón Social", "Razon Social Proveedor", "razonSocial", "razonSocialProveedor"];

    // ── Buscar cache del período actual ──────────────────────────────────────
    const cache = await prisma.siiApiCache.findUnique({
        where: {
            empresaKey_tipo_mes_ano: { empresaKey: empresa, tipo: cacheTipo, mes, ano },
        },
    });

    // ── Buscar cache del período anterior (para delta) ────────────────────────
    const periodoAnterior = getPeriodoAnterior(mes, ano);

    const cacheAnterior = await prisma.siiApiCache.findUnique({
        where: {
            empresaKey_tipo_mes_ano: {
                empresaKey: empresa,
                tipo: cacheTipo,
                mes: periodoAnterior.mes,
                ano: periodoAnterior.ano,
            },
        },
    });

    // Si no existe cache actual, devolvemos estructura vacía con delta null
    if (!cache) {
        return {
            exists: false,
            empresa,
            mes,
            ano,
            tipo,
            cacheTipo,
            cacheUpdatedAt: null,
            kpis: {
                totalDocumentos: 0,
                montoNeto: 0,
                montoIva: 0,
                montoTotal: 0,
                promedioDocumento: 0,
                contrapartesUnicas: 0,
                deltaPctVsMesAnterior: null,
            },
            porTipoDocumento: [],
            topContrapartesMonto: [],
            topContrapartesCantidad: [],
            porDia: [],
            documentos: [],
        };
    }

    const documentos = getDocumentosFromCache(cache.data);

    // ── Calcular totales del período actual ───────────────────────────────────
    const montos = documentos.reduce(
        (acc, doc) => {
            acc.montoNeto += toNumber(getValue(doc, ["Monto Neto", "montoNeto"], 0));
            acc.montoIva += toNumber(
                getValue(doc, ["Monto IVA", "Monto Iva", "Monto IVA Recuperable", "montoIva", "montoIVA"], 0)
            );
            acc.montoTotal += toNumber(getValue(doc, ["Monto total", "Monto Total", "montoTotal"], 0));
            return acc;
        },
        { montoNeto: 0, montoIva: 0, montoTotal: 0 }
    );

    // ── Calcular total del período anterior para delta ────────────────────────
    const docsAnterior = cacheAnterior ? getDocumentosFromCache(cacheAnterior.data) : [];
    const montoTotalAnterior = docsAnterior.reduce(
        (sum, doc) => sum + toNumber(getValue(doc, ["Monto total", "Monto Total", "montoTotal"], 0)),
        0
    );

    const deltaPctVsMesAnterior = calcularDeltaPct(montos.montoTotal, montoTotalAnterior);

    // ── Construir agrupaciones ────────────────────────────────────────────────
    const contrapartes = new Set<string>();

    const porTipoDocumentoMap = new Map<
        string,
        { tipoDocumento: string; cantidad: number; montoNeto: number; montoIva: number; montoTotal: number }
    >();

    const contraparteMap = new Map<
        string,
        { rut: string; nombre: string; cantidad: number; montoNeto: number; montoIva: number; montoTotal: number }
    >();

    const porDiaMap = new Map<string, { fecha: string; cantidad: number; montoTotal: number }>();

    for (const doc of documentos) {
        const tipoDoc = String(getValue(doc, ["Tipo Doc", "tipoDoc", "tipoDTE"], "Sin tipo"));
        const rut = String(getValue(doc, contraparteRutKeys, "Sin RUT"));
        const nombre = String(getValue(doc, contraparteNombreKeys, "Sin razón social"));
        const montoNeto = toNumber(getValue(doc, ["Monto Neto", "montoNeto"], 0));
        const montoIva = toNumber(
            getValue(doc, ["Monto IVA", "Monto Iva", "Monto IVA Recuperable", "montoIva", "montoIVA"], 0)
        );
        const montoTotal = toNumber(getValue(doc, ["Monto total", "Monto Total", "montoTotal"], 0));
        const fecha = parseFechaDia(
            getValue(doc, ["Fecha Docto", "Fecha Recepcion", "fechaDocto", "fechaEmision"])
        );

        contrapartes.add(rut);

        addToMap(
            porTipoDocumentoMap,
            tipoDoc,
            { tipoDocumento: tipoDoc, cantidad: 0, montoNeto: 0, montoIva: 0, montoTotal: 0 },
            (row) => { row.cantidad += 1; row.montoNeto += montoNeto; row.montoIva += montoIva; row.montoTotal += montoTotal; }
        );

        addToMap(
            contraparteMap,
            rut,
            { rut, nombre, cantidad: 0, montoNeto: 0, montoIva: 0, montoTotal: 0 },
            (row) => { row.cantidad += 1; row.montoNeto += montoNeto; row.montoIva += montoIva; row.montoTotal += montoTotal; }
        );

        addToMap(
            porDiaMap,
            fecha,
            { fecha, cantidad: 0, montoTotal: 0 },
            (row) => { row.cantidad += 1; row.montoTotal += montoTotal; }
        );
    }

    // ── Ordenar resultados ────────────────────────────────────────────────────
    const porTipoDocumento = Array.from(porTipoDocumentoMap.values()).sort(
        (a, b) => b.montoTotal - a.montoTotal
    );

    const topContrapartesMonto = Array.from(contraparteMap.values())
        .sort((a, b) => b.montoTotal - a.montoTotal)
        .slice(0, 10);

    const topContrapartesCantidad = Array.from(contraparteMap.values())
        .sort((a, b) => b.cantidad - a.cantidad)
        .slice(0, 10);

    const porDia = Array.from(porDiaMap.values()).sort((a, b) => a.fecha.localeCompare(b.fecha));

    return {
        exists: true,
        empresa,
        mes,
        ano,
        tipo,
        cacheTipo,
        cacheUpdatedAt: cache.updatedAt,
        kpis: {
            totalDocumentos: documentos.length,
            montoNeto: montos.montoNeto,
            montoIva: montos.montoIva,
            montoTotal: montos.montoTotal,
            promedioDocumento:
                documentos.length > 0 ? Math.round(montos.montoTotal / documentos.length) : 0,
            contrapartesUnicas: contrapartes.size,
            deltaPctVsMesAnterior,
        },
        porTipoDocumento,
        topContrapartesMonto,
        topContrapartesCantidad,
        porDia,
        documentos,
    };
}