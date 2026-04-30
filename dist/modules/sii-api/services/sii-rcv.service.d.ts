import type { RcvQuery, RcvTipo } from "../types/sii-api.types.js";
export declare function obtenerRcv({ tipo, empresaKey, mes, ano, forceRefresh, }: RcvQuery & {
    tipo: RcvTipo;
}): Promise<{
    source: "cache";
    raw: import("@prisma/client/runtime/library").JsonValue;
    documentos: import("../types/sii-api.types.js").NormalizedRcvDocumento[];
} | {
    source: "simpleapi";
    raw: unknown;
    documentos: import("../types/sii-api.types.js").NormalizedRcvDocumento[];
}>;
export declare function obtenerRcvVentas(params: RcvQuery): Promise<{
    source: "cache";
    raw: import("@prisma/client/runtime/library").JsonValue;
    documentos: import("../types/sii-api.types.js").NormalizedRcvDocumento[];
} | {
    source: "simpleapi";
    raw: unknown;
    documentos: import("../types/sii-api.types.js").NormalizedRcvDocumento[];
}>;
export declare function obtenerRcvCompras(params: RcvQuery): Promise<{
    source: "cache";
    raw: import("@prisma/client/runtime/library").JsonValue;
    documentos: import("../types/sii-api.types.js").NormalizedRcvDocumento[];
} | {
    source: "simpleapi";
    raw: unknown;
    documentos: import("../types/sii-api.types.js").NormalizedRcvDocumento[];
}>;
//# sourceMappingURL=sii-rcv.service.d.ts.map