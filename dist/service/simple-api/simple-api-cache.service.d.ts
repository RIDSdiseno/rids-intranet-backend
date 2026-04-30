type RcvTipo = "ventas" | "compras";
type GetCacheParams = {
    empresaKey: string;
    rutEmpresa: string;
    tipo: RcvTipo;
    mes: string;
    ano: string;
};
export declare function getSiiApiCache(params: GetCacheParams): Promise<{
    id: number;
    updatedAt: Date;
    createdAt: Date;
    tipo: string;
    mes: string | null;
    empresaKey: string;
    rutEmpresa: string;
    ano: string | null;
    data: import("@prisma/client/runtime/library").JsonValue;
} | null>;
export declare function saveSiiApiCache(params: GetCacheParams, data: unknown): Promise<{
    id: number;
    updatedAt: Date;
    createdAt: Date;
    tipo: string;
    mes: string | null;
    empresaKey: string;
    rutEmpresa: string;
    ano: string | null;
    data: import("@prisma/client/runtime/library").JsonValue;
}>;
export {};
//# sourceMappingURL=simple-api-cache.service.d.ts.map