type RcvTipo = "ventas" | "compras";
type GetCacheParams = {
    empresaKey: string;
    rutEmpresa: string;
    tipo: RcvTipo;
    mes: string;
    ano: string;
};
export declare function getSiiApiCache(params: GetCacheParams): Promise<{
    createdAt: Date;
    updatedAt: Date;
    id: number;
    tipo: string;
    mes: string | null;
    ano: string | null;
    empresaKey: string;
    rutEmpresa: string;
    data: import("@prisma/client/runtime/library").JsonValue;
} | null>;
export declare function saveSiiApiCache(params: GetCacheParams, data: unknown): Promise<{
    createdAt: Date;
    updatedAt: Date;
    id: number;
    tipo: string;
    mes: string | null;
    ano: string | null;
    empresaKey: string;
    rutEmpresa: string;
    data: import("@prisma/client/runtime/library").JsonValue;
}>;
export {};
//# sourceMappingURL=simple-api-cache.service.d.ts.map