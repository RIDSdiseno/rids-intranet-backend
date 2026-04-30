export type EmpresaKey = "econnet" | "rids";
export type RcvTipo = "ventas" | "compras";

// Configuración de empresa (viene del .env)
export type EmpresaConfig = {
    rutEmpresa: string;
    claveSii: string;           // Clave de la persona natural representante
    rutRepresentante: string;   // RUT persona natural
};

// Lo que se pasa al cliente HTTP
export type SiiApiRequestParams = {
    empresaKey: EmpresaKey;
    empresaConfig: EmpresaConfig;
    endpoint: string;
    method?: "GET" | "POST";
    params?: Record<string, unknown>;
};

// Lo que piden los servicios de negocio
export type RcvQuery = {
    empresaKey: EmpresaKey;
    mes: string;   // "04"
    ano: string;   // "2026"
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