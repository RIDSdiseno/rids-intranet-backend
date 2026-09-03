type EmpresaKey = "econnet" | "rids";
export type CobranzaSyncResultado = {
    empresa: EmpresaKey;
    ok: boolean;
    cached?: boolean;
    cacheUpdatedAt?: Date | string | null;
    error?: string;
};
export declare function sincronizarRcvCobranza(): Promise<CobranzaSyncResultado[]>;
export {};
//# sourceMappingURL=cobranza-sync.service.d.ts.map