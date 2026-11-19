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
export type ValidarDteAntesDeEnviarParams = {
    empresa: EmpresaBaseApiKey;
    periodo: string;
    tipoDoc: string;
    folio: string;
    rutContraparte: string;
};
export declare function validarDteAntesDeEnviar(params: ValidarDteAntesDeEnviarParams): Promise<{
    valido: boolean;
    estado: string;
    motivo: string;
} | {
    valido: boolean;
    estado: string;
    motivo: null;
}>;
export declare function procesarEnviosFactura(options?: ProcesarEnviosFacturaOptions): Promise<ResultadoProcesarEnviosFactura>;
export declare function procesarRecoveryEnviosFactura(options?: {
    empresa?: EmpresaBaseApiKey;
    limite?: number;
}): Promise<ResultadoProcesarEnviosFactura>;
//# sourceMappingURL=factura-envio.service.d.ts.map