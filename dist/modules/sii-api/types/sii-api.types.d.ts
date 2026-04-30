export type EmpresaKey = "econnet" | "rids";
export type RcvTipo = "ventas" | "compras";
export type EmpresaConfig = {
    rutEmpresa: string;
    claveSii: string;
    rutRepresentante: string;
};
export type SiiApiRequestParams = {
    empresaKey: EmpresaKey;
    empresaConfig: EmpresaConfig;
    endpoint: string;
    method?: "GET" | "POST";
    params?: Record<string, unknown>;
};
export type RcvQuery = {
    empresaKey: EmpresaKey;
    mes: string;
    ano: string;
    forceRefresh?: boolean;
};
export type NormalizedRcvDocumento = {
    tipoDte?: string | number | null;
    folio?: string | number | null;
    rutEmisor?: string | null;
    razonSocialEmisor?: string | null;
    rutReceptor?: string | null;
    razonSocialReceptor?: string | null;
    fechaEmision?: string | null;
    fechaRecepcion?: string | null;
    montoNeto?: number | null;
    montoIva?: number | null;
    montoTotal?: number | null;
    estado?: string | null;
    raw: unknown;
};
//# sourceMappingURL=sii-api.types.d.ts.map