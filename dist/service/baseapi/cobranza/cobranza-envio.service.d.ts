import type { EmpresaKey } from "./cobranza-estado.service.js";
type ProcesarEnviosOptions = {
    empresa?: EmpresaKey;
    limite?: number;
    ids?: number[];
    recuperarAtascados?: boolean;
};
export type ResultadoProcesarEnvios = {
    recuperados: number;
    procesados: number;
    enviados: number;
    errores: number;
    omitidos: number;
};
export declare function procesarEnviosCobranza(options?: ProcesarEnviosOptions): Promise<ResultadoProcesarEnvios>;
export declare function procesarRecoveryEnviosCobranza(options?: {
    empresa?: EmpresaKey;
    limite?: number;
}): Promise<ResultadoProcesarEnvios>;
export {};
//# sourceMappingURL=cobranza-envio.service.d.ts.map