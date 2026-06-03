import { prisma } from "../../lib/prisma.js";
import { baseApiClient, normalizeBaseApiError } from "./baseapi.client.js";
import {
    getEmpresaBaseApiConfig,
    type EmpresaBaseApiKey,
} from "./baseapi.empresas.js";

export type TipoRcv = "ventas" | "compras";

export type ConsultarRcvParams = {
    empresa: EmpresaBaseApiKey;
    mes: string | number;
    ano: string | number;
    tipo: TipoRcv;
    forceRefresh?: boolean;
    incluirPendientes?: boolean;
};

function normalizarMes(mes: string | number): string {
    return String(mes).padStart(2, "0");
}

function normalizarAno(ano: string | number): string {
    return String(ano);
}

function normalizarPeriodo(mes: string | number, ano: string | number): string {
    return `${normalizarAno(ano)}-${normalizarMes(mes)}`;
}

function mapTipoBaseApi(tipo: TipoRcv): "venta" | "compra" {
    return tipo === "ventas" ? "venta" : "compra";
}

function normalizarRut(rut: string): string {
    return rut.replace(/\./g, "").trim().toUpperCase();
}

function getCacheTipo(tipo: TipoRcv): string {
    return `baseapi-rcv-${tipo}`;
}

function getBaseApiPayload(json: any) {
    return json?.data ?? {};
}

function getDatosRcv(json: any): any[] {
    const payload = getBaseApiPayload(json);

    if (Array.isArray(payload?.datos)) return payload.datos;
    if (Array.isArray(payload?.documentos)) return payload.documentos;
    if (Array.isArray(payload?.data)) return payload.data;

    return [];
}

function getEstadoVenta(doc: any): string {
    const fechaAcuse =
        doc["Fecha Acuse Recibo"] ??
        doc["Fecha Acuse"] ??
        doc.fechaAcuseRecibo ??
        "";

    const fechaReclamo =
        doc["Fecha Reclamo"] ??
        doc.fechaReclamo ??
        "";

    if (String(fechaReclamo).trim()) {
        return "RECLAMADO";
    }

    if (String(fechaAcuse).trim()) {
        return "ACUSADO";
    }

    return "PENDIENTE ACUSE CLIENTE";
}

function getResumenPorTipo(json: any): any[] {
    const payload = getBaseApiPayload(json);

    if (Array.isArray(payload?.resumenPorTipo)) return payload.resumenPorTipo;

    return [];
}

function getDocumentoKey(doc: any) {
    const tipo =
        doc["Tipo Doc"] ??
        doc.tipoDoc ??
        doc.tipoDTE ??
        "";

    const rut =
        doc["RUT Proveedor"] ??
        doc["Rut Proveedor"] ??
        doc["RUT Cliente"] ??
        doc["Rut cliente"] ??
        doc.rutProveedor ??
        doc.rutCliente ??
        doc.rutReceptor ??
        "";

    const folio =
        doc["Folio"] ??
        doc.folio ??
        "";

    return `${String(tipo).trim()}-${String(rut).trim()}-${String(folio).trim()}`;
}

function deduplicarDocumentos(documentos: any[]) {
    const map = new Map<string, any>();

    for (const doc of documentos) {
        const key = getDocumentoKey(doc);

        if (!key || key === "--") continue;

        const existente = map.get(key);

        if (!existente) {
            map.set(key, doc);
            continue;
        }

        const existentePendiente = String(
            existente.Estado ?? existente.estado ?? ""
        ).includes("PENDIENTE");

        const nuevoPendiente = String(
            doc.Estado ?? doc.estado ?? ""
        ).includes("PENDIENTE");

        // Si existe uno registrado y otro pendiente, preferimos el registrado.
        if (existentePendiente && !nuevoPendiente) {
            map.set(key, doc);
        }
    }

    return Array.from(map.values());
}

function normalizarDocumentosRegistrados(docs: any[], tipo: TipoRcv) {
    return docs.map((doc) => {
        const estado =
            tipo === "ventas"
                ? getEstadoVenta(doc)
                : doc.Estado ?? doc.estado ?? "REGISTRADO";

        return {
            ...doc,
            Estado: estado,
            estado,
            origenRcv: tipo === "compras"
                ? "COMPRAS_REGISTRADAS"
                : "VENTAS_REGISTRADAS",
        };
    });
}

function normalizarDocumentosPendientes(docs: any[]) {
    return docs.map((doc) => ({
        ...doc,
        Estado: "PENDIENTE ACUSE",
        estado: "PENDIENTE ACUSE",
        origenRcv: "COMPRAS_PENDIENTES",
    }));
}

function recalcularResumenBasico(documentos: any[]) {
    const totalRegistros = documentos.length;

    return {
        totalRegistros,
        documentosPendientes: documentos.filter((doc) =>
            String(doc.Estado ?? doc.estado ?? "").includes("PENDIENTE")
        ).length,
        documentosRegistrados: documentos.filter((doc) =>
            !String(doc.Estado ?? doc.estado ?? "").includes("PENDIENTE")
        ).length,
    };
}

async function consultarRcvNormalBaseApi(params: {
    empresa: EmpresaBaseApiKey;
    endpoint: string;
    body: any;
    tipo: TipoRcv;
    cacheTipo: string;
    mesNormalizado: string;
    anoNormalizado: string;
    rutEmpresa: string;
    periodo: string;
    tipoBaseApi: "venta" | "compra";
    forceRefresh: boolean;
}) {
    const {
        empresa,
        endpoint,
        body,
        tipo,
        cacheTipo,
        mesNormalizado,
        anoNormalizado,
        rutEmpresa,
        periodo,
        tipoBaseApi,
        forceRefresh,
    } = params;

    if (!forceRefresh) {
        const cached = await prisma.siiApiCache.findUnique({
            where: {
                empresaKey_tipo_mes_ano: {
                    empresaKey: empresa,
                    tipo: cacheTipo,
                    mes: mesNormalizado,
                    ano: anoNormalizado,
                },
            },
        });

        if (cached) {
            console.log("✅ BaseAPI RCV cache HIT:", {
                empresa,
                rutEmpresa,
                tipo,
                cacheTipo,
                mes: mesNormalizado,
                ano: anoNormalizado,
                updatedAt: cached.updatedAt,
            });

            return {
                cached: true,
                cacheUpdatedAt: cached.updatedAt,
                data: cached.data,
                status: null,
            };
        }
    }

    console.log("📡 BaseAPI RCV cache MISS, consultando API:", {
        empresa,
        endpoint,
        method: "POST",
        periodo,
        tipo,
        tipoBaseApi,
        cacheTipo,
        rutSii: body.rut,
        rutEmpresa: body.rut_empresa,
        hasPasswordSii: Boolean(body.password),
        forceRefresh,
        baseUrl: process.env.BASEAPI_URL ?? "https://api.baseapi.cl",
        hasBaseApiKey: Boolean(process.env.BASEAPI_KEY),
        baseApiKeyLength: process.env.BASEAPI_KEY?.length ?? 0,
    });

    const response = await baseApiClient.post(endpoint, body);

    await prisma.siiApiCache.upsert({
        where: {
            empresaKey_tipo_mes_ano: {
                empresaKey: empresa,
                tipo: cacheTipo,
                mes: mesNormalizado,
                ano: anoNormalizado,
            },
        },
        create: {
            empresaKey: empresa,
            rutEmpresa,
            tipo: cacheTipo,
            mes: mesNormalizado,
            ano: anoNormalizado,
            data: response.data,
        },
        update: {
            rutEmpresa,
            data: response.data,
        },
    });

    return {
        cached: false,
        cacheUpdatedAt: null,
        data: response.data,
        status: response.status,
    };
}

async function consultarComprasPendientesBaseApi(params: {
    empresa: EmpresaBaseApiKey;
    periodo: string;
    body: any;
}) {
    const { empresa, periodo, body } = params;

    const endpointPendientes = `/api/v1/sii/rcv/${periodo}/compra/pendientes`;

    try {
        console.log("📡 BaseAPI RCV compras pendientes, consultando API:", {
            empresa,
            endpoint: endpointPendientes,
            method: "POST",
            periodo,
            rutSii: body.rut,
            rutEmpresa: body.rut_empresa,
            hasPasswordSii: Boolean(body.password),
            cache: "NO_CACHE",
        });

        const response = await baseApiClient.post(endpointPendientes, body);

        return {
            ok: true,
            endpoint: endpointPendientes,
            data: response.data,
            status: response.status,
        };
    } catch (error) {
        const normalized = normalizeBaseApiError(error);

        console.warn("⚠️ No se pudieron consultar compras pendientes BaseAPI:", {
            empresa,
            endpoint: endpointPendientes,
            periodo,
            error: normalized.message,
        });

        return {
            ok: false,
            endpoint: endpointPendientes,
            data: null,
            status: null,
            error: normalized.message,
        };
    }
}

function combinarComprasConPendientes(params: {
    dataNormal: any;
    dataPendientes: any | null;
}) {
    const { dataNormal, dataPendientes } = params;

    const docsNormales = normalizarDocumentosRegistrados(
        getDatosRcv(dataNormal),
        "compras"
    );

    const docsPendientes = normalizarDocumentosPendientes(
        dataPendientes ? getDatosRcv(dataPendientes) : []
    );

    const documentos = deduplicarDocumentos([
        ...docsPendientes,
        ...docsNormales,
    ]);

    const payloadNormal = getBaseApiPayload(dataNormal);
    const resumenNormal = getResumenPorTipo(dataNormal);

    return {
        ...dataNormal,
        data: {
            ...payloadNormal,
            datos: documentos,
            totalRegistros: documentos.length,
            resumenPorTipo: resumenNormal,
            metaRcv: {
                ...recalcularResumenBasico(documentos),
                incluyePendientes: true,
                pendientesNoCacheados: true,
            },
        },
    };
}

function normalizarRcvSinPendientes(params: {
    dataNormal: any;
    tipo: TipoRcv;
}) {
    const { dataNormal, tipo } = params;

    const docsNormales = normalizarDocumentosRegistrados(
        getDatosRcv(dataNormal),
        tipo
    );

    const payloadNormal = getBaseApiPayload(dataNormal);

    return {
        ...dataNormal,
        data: {
            ...payloadNormal,
            datos: docsNormales,
            totalRegistros: docsNormales.length,
            metaRcv: {
                ...recalcularResumenBasico(docsNormales),
                incluyePendientes: false,
                pendientesNoCacheados: false,
            },
        },
    };
}

// Función para consultar las RCV en BaseAPI.
export async function consultarRcvBaseApi(params: ConsultarRcvParams) {
    const {
        empresa,
        mes,
        ano,
        tipo,
        forceRefresh = false,
        incluirPendientes = true,
    } = params;

    const config = getEmpresaBaseApiConfig(empresa);

    const mesNormalizado = normalizarMes(mes);
    const anoNormalizado = normalizarAno(ano);
    const periodo = normalizarPeriodo(mesNormalizado, anoNormalizado);

    const tipoBaseApi = mapTipoBaseApi(tipo);
    const cacheTipo = getCacheTipo(tipo);

    const rutEmpresa = normalizarRut(config.rutEmpresa);

    const endpoint = `/api/v1/sii/rcv/${periodo}/${tipoBaseApi}`;

    const body = {
        rut: normalizarRut(config.rutSii),
        password: config.passwordSii,
        rut_empresa: rutEmpresa,
    };

    const startedAt = Date.now();

    try {
        const normalResult = await consultarRcvNormalBaseApi({
            empresa,
            endpoint,
            body,
            tipo,
            cacheTipo,
            mesNormalizado,
            anoNormalizado,
            rutEmpresa,
            periodo,
            tipoBaseApi,
            forceRefresh,
        });

        let dataFinal = normalizarRcvSinPendientes({
            dataNormal: normalResult.data,
            tipo,
        });

        let pendientesResult: Awaited<ReturnType<typeof consultarComprasPendientesBaseApi>> | null = null;

        if (tipo === "compras" && incluirPendientes) {
            pendientesResult = await consultarComprasPendientesBaseApi({
                empresa,
                periodo,
                body,
            });

            dataFinal = combinarComprasConPendientes({
                dataNormal: normalResult.data,
                dataPendientes: pendientesResult.ok ? pendientesResult.data : null,
            });
        }

        console.log("✅ BaseAPI RCV response preparada:", {
            empresa,
            endpoint,
            status: normalResult.status,
            periodo,
            tipo,
            cacheTipo,
            cached: normalResult.cached,
            incluyePendientes: tipo === "compras" && incluirPendientes,
            pendientesOk: pendientesResult?.ok ?? null,
            durationMs: Date.now() - startedAt,
        });

        return {
            cached: normalResult.cached,
            cacheUpdatedAt: normalResult.cacheUpdatedAt,
            data: dataFinal,
            pendientes: pendientesResult
                ? {
                    ok: pendientesResult.ok,
                    error: "error" in pendientesResult ? pendientesResult.error : null,
                }
                : null,
        };
    } catch (error) {
        const normalized = normalizeBaseApiError(error);

        console.error("❌ Error consultando RCV BaseAPI:", {
            empresa,
            endpoint,
            method: "POST",
            periodo,
            tipo,
            tipoBaseApi,
            cacheTipo,
            durationMs: Date.now() - startedAt,
            error: normalized.message,
        });

        throw normalized;
    }
}

export async function consultarVentasRcvBaseApi(params: {
    empresa: EmpresaBaseApiKey;
    mes: string | number;
    ano: string | number;
    forceRefresh?: boolean;
}) {
    return consultarRcvBaseApi({
        ...params,
        tipo: "ventas",
        incluirPendientes: false,
    });
}

export async function consultarComprasRcvBaseApi(params: {
    empresa: EmpresaBaseApiKey;
    mes: string | number;
    ano: string | number;
    forceRefresh?: boolean;
    incluirPendientes?: boolean;
}) {
    return consultarRcvBaseApi({
        ...params,
        tipo: "compras",
        incluirPendientes: params.incluirPendientes ?? true,
    });
}