import type { Request, Response } from "express";
import type { EmpresaKey } from "../../service/baseapi/cobranza/cobranza-estado.service.js";
import { type DocumentoCxc, type NotaCxc, type ResumenCxc } from "../../service/baseapi/finanzas/cxc-documentos.service.js";
/** Documento que viaja al frontend (las NC como "61-folio"). */
export type DocumentoCxcVista = Omit<DocumentoCxc, "notasCredito"> & {
    notasCredito: string[];
};
type DiagnosticoVista = {
    periodosLeidos: number;
    primerPeriodo: string | null;
    ultimoPeriodo: string | null;
    sinVencimiento: number;
    plazoEmpresa: number;
    ncInferidas: number;
    ncSinAplicar: number;
};
export type RespuestaResumenCxc = Omit<ResumenCxc, "diagnostico"> & {
    generadoAt: string;
    desdeCache: boolean;
    /** Abiertos (vencidos y por vencer, incluidos sin fecha) y pagados en el mes actual. */
    documentos: DocumentoCxcVista[];
    diagnostico: DiagnosticoVista;
};
export type RespuestaDocumentosCxc = {
    empresaKey: EmpresaKey;
    hoy: string;
    generadoAt: string;
    desdeCache: boolean;
    documentos: DocumentoCxcVista[];
    notas: NotaCxc[];
};
export type Calculo = {
    resumen: Omit<RespuestaResumenCxc, "desdeCache" | "documentos">;
    documentos: DocumentoCxcVista[];
    notas: NotaCxc[];
};
/** Borra la caché (por ejemplo, después de registrar un pago desde otro módulo). */
export declare function invalidarCacheCxc(empresaKey?: EmpresaKey): void;
export declare function obtenerCalculo(empresaKey: EmpresaKey, refrescar: boolean): Promise<{
    data: Calculo;
    desdeCache: boolean;
}>;
export declare function getResumenCxc(req: Request, res: Response): Promise<Response<any, Record<string, any>>>;
/** Busca una factura en el cálculo de la empresa (usa la caché). Lo usan los envíos manuales (Fase 2b). */
export declare function buscarDocumentoCxc(params: {
    empresa: unknown;
    tipoDoc: unknown;
    folio: unknown;
    rutContraparte: unknown;
}): Promise<{
    empresaKey: EmpresaKey;
    documento: DocumentoCxcVista | null;
}>;
export declare function getDocumentosCxc(req: Request, res: Response): Promise<Response<any, Record<string, any>>>;
export {};
//# sourceMappingURL=baseapi-finanzas-cxc.controller.d.ts.map