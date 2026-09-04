import type { EmpresaBaseApiKey } from "../baseapi.empresas.js";
export type ProcesarEnviosFacturaOptions = {
    empresa?: EmpresaBaseApiKey;
    limite?: number;
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
//# sourceMappingURL=factura-envio.service.d.ts.map