import type { EmpresaKey } from "./cobranza-estado.service.js";
type ProcesarEnviosOptions = {
    empresa?: EmpresaKey;
    limite?: number;
};
export type ResultadoProcesarEnvios = {
    recuperados: number;
    procesados: number;
    enviados: number;
    errores: number;
    omitidos: number;
};
export declare function procesarEnviosCobranza(options?: ProcesarEnviosOptions): Promise<ResultadoProcesarEnvios>;
export {};
//# sourceMappingURL=cobranza-envio.service.d.ts.map