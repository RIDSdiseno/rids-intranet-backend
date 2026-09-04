import type { EmpresaBaseApiKey } from "./baseapi.empresas.js";
export type GenerarDtePdfParams = {
    empresa: EmpresaBaseApiKey;
    periodo: string;
    folio: string | number;
    tipoDTE?: string | number;
    forceRefresh?: boolean;
};
export type GenerarDtePdfResult = {
    buffer: Buffer;
    filename: string;
};
export declare function generarDtePdfBuffer(params: GenerarDtePdfParams): Promise<GenerarDtePdfResult>;
//# sourceMappingURL=baseapi-dte-pdf.service.d.ts.map