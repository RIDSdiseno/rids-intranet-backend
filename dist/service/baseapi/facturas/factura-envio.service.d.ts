import type { EmpresaBaseApiKey } from "../baseapi.empresas.js";
export type ProcesarEnviosFacturaOptions = {
    empresa?: EmpresaBaseApiKey;
    limite?: number;
    ids?: number[];
    recuperarAtascados?: boolean;
};
export type ResultadoProcesarEnviosFactura = {
    recuperados: number;
    encontrados: number;
    procesados: number;
    enviados: number;
    errores: number;
    omitidos: number;
    cancelados: number;
};
export declare function procesarEnviosFactura(options?: ProcesarEnviosFacturaOptions): Promise<ResultadoProcesarEnviosFactura>;
export declare function procesarRecoveryEnviosFactura(options?: {
    empresa?: EmpresaBaseApiKey;
    limite?: number;
}): Promise<ResultadoProcesarEnviosFactura>;
//# sourceMappingURL=factura-envio.service.d.ts.map