type LogParams = {
    empresaKey?: string | null;
    rutEmpresa?: string | null;
    endpoint: string;
    method?: string;
    status?: number | null;
    ok: boolean;
    error?: string | null;
    durationMs?: number | null;
};
export declare function createSiiApiLog(params: LogParams): Promise<void>;
export {};
//# sourceMappingURL=sii-api-log.service.d.ts.map