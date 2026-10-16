import { type EmpresaBaseApiKey } from "./baseapi.empresas.js";
export type TipoRcv = "ventas" | "compras";
export type ConsultarRcvParams = {
    empresa: EmpresaBaseApiKey;
    mes: string | number;
    ano: string | number;
    tipo: TipoRcv;
    forceRefresh?: boolean;
    incluirPendientes?: boolean;
};
export type ConsultarRcvAnualCacheParams = {
    empresa: EmpresaBaseApiKey;
    ano: string | number;
};
export declare function consultarRcvBaseApi(params: ConsultarRcvParams): Promise<{
    cached: boolean;
    cacheUpdatedAt: Date | null;
    data: any;
    pendientes: {
        ok: boolean;
        error: string | null;
    } | null;
}>;
export declare function consultarVentasRcvBaseApi(params: {
    empresa: EmpresaBaseApiKey;
    mes: string | number;
    ano: string | number;
    forceRefresh?: boolean;
}): Promise<{
    cached: boolean;
    cacheUpdatedAt: Date | null;
    data: any;
    pendientes: {
        ok: boolean;
        error: string | null;
    } | null;
}>;
export declare function consultarComprasRcvBaseApi(params: {
    empresa: EmpresaBaseApiKey;
    mes: string | number;
    ano: string | number;
    forceRefresh?: boolean;
    incluirPendientes?: boolean;
}): Promise<{
    cached: boolean;
    cacheUpdatedAt: Date | null;
    data: any;
    pendientes: {
        ok: boolean;
        error: string | null;
    } | null;
}>;
export declare function consultarVentasRcvAnualCache(params: ConsultarRcvAnualCacheParams): Promise<{
    cached: boolean;
    cacheUpdatedAt: Date | null;
    mesesDisponibles: string[];
    data: {
        detalleVentas: any[];
        ventas: any[];
        documentos: any[];
        total: number;
        data: {
            datos: any[];
            totalRegistros: number;
            metaRcv: {
                anual: boolean;
                ano: string;
                mesesDisponibles: string[];
            };
        };
    };
}>;
//# sourceMappingURL=baseapi-rcv.service.d.ts.map