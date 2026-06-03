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
//# sourceMappingURL=baseapi-rcv.service.d.ts.map