export type EmpresaBaseApiKey = "econnet" | "rids";
export type EmpresaBaseApiConfig = {
    empresaKey: EmpresaBaseApiKey;
    rutEmpresa: string;
    rutSii: string;
    passwordSii: string;
};
export declare function getEmpresaBaseApiConfig(empresaRaw: string | undefined): EmpresaBaseApiConfig;
//# sourceMappingURL=baseapi.empresas.d.ts.map