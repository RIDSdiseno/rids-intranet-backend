import type { EmpresaKey } from "./cobranza-estado.service.js";
export type NotaCreditoAplicada = {
    folio: string;
    montoTotal: number;
    codigoRef: string | null;
    razonRef: string | null;
};
export type AplicacionNotaCredito = {
    tipoDoc: string;
    folio: string;
    rutContraparte: string;
    anulaCompletamente: boolean;
    montoNotasCredito: number;
    notasCredito: NotaCreditoAplicada[];
};
export type ResultadoAplicacionesNotasCredito = {
    aplicaciones: Map<string, AplicacionNotaCredito>;
    notasDebitoSoloReversa: Set<string>;
};
export declare function obtenerAplicacionesNotasCredito(params: {
    empresa: EmpresaKey;
    documentos: any[];
    consultaSiiActiva: boolean;
}): Promise<ResultadoAplicacionesNotasCredito>;
//# sourceMappingURL=cobranza-notas-credito.service.d.ts.map