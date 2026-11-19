import type { EmpresaKey } from "../cobranza/cobranza-estado.service.js";
import { type PagoCartola } from "./cartola-itau.parser.js";
/** Lo que se usa de un documento del núcleo (DocumentoCxc del controlador). */
export type DocumentoBanco = {
    key: string;
    tipoDoc: string;
    folio: string;
    rutContraparte: string;
    razonSocial: string | null;
    fechaEmision: string | null;
    montoOriginal: number;
    montoNotasCredito: number;
    saldo: number;
    estado: "PAGADO" | "PENDIENTE" | "VENCIDO" | "COMPENSADO";
    pagadoAt: string | null;
};
export type TipoPropuesta = "PERFECTO" | "COMBINADO" | "YA_PAGADA" | "SUGERIDO" | "SIN_MATCH";
export type AsignacionPropuesta = {
    tipoDoc: string;
    folio: string;
    rutContraparte: string;
    razonSocial: string | null;
    fechaEmision: string | null;
    estado: DocumentoBanco["estado"];
    /** Pendiente (abiertas) o monto − NC (pagadas). */
    saldo: number;
    monto: number;
    accion: "ABONO" | "VINCULO";
};
export type Propuesta = {
    tipo: TipoPropuesta;
    motivo: string;
    asignaciones: AsignacionPropuesta[];
};
export type MovimientoVista = {
    id: number;
    empresaKey: string;
    fecha: string;
    hora: string | null;
    rutPagador: string | null;
    nombrePagador: string | null;
    producto: string | null;
    referencia: string | null;
    medioPago: string | null;
    monto: number;
    estado: string;
    motivoDescarte: string | null;
    observacion: string | null;
    archivo: string | null;
    responsable: string | null;
    conciliadoAt: string | null;
    propuesta: Propuesta | null;
    asignaciones: Array<{
        id: number;
        tipoDoc: string;
        folio: string;
        rutContraparte: string;
        razonSocial: string | null;
        monto: number;
        tipo: string;
    }>;
};
export type ResultadoImportacion = {
    aplicado: boolean;
    titular: string | null;
    leidos: number;
    nuevos: number;
    duplicados: number;
    noPagados: number;
    descartadosAuto: number;
    /** Pagos nuevos que se parecen a otro (mismo día + pagador + monto) aunque cambie la hora, la referencia o el nombre. */
    posiblesDuplicados: number;
    /** Posibles duplicados que no se importaron porque se pidió omitirlos. */
    omitidos: number;
    total: number;
    advertencias: string[];
    filas: Array<PagoCartola & {
        duplicado: boolean;
        descarteAuto: string | null;
        posibleDuplicado: PosibleDuplicado | null;
    }>;
};
export type PosibleDuplicado = {
    /** CARGADO: se parece a un movimiento ya guardado. ARCHIVO: se parece a otra fila del mismo archivo. */
    origen: "CARGADO" | "ARCHIVO";
    detalle: string;
};
/** Prefijo de la observación de los movimientos importados como posible duplicado (la pantalla lo usa para marcarlos). */
export declare const PREFIJO_POSIBLE_DUPLICADO = "Posible duplicado";
export declare class BancoError extends Error {
}
export declare const MOTIVOS_DESCARTE: readonly ["TRASPASO_EMPRESAS", "PASARELA", "NO_ES_CLIENTE", "DUPLICADO", "OTRO"];
export type MotivoDescarte = (typeof MOTIVOS_DESCARTE)[number];
/** «Paga F 577», «pago FX 572», «FACTURAS 580 Y 581», «F577/578» → ["577", "572", ...] */
export declare function foliosEnReferencia(referencia: string | null): string[];
/** «Rut 76 527 100 2», «76.527.100-2» → ["765271002"] */
export declare function rutsEnReferencia(referencia: string | null): string[];
type Contexto = {
    docs: DocumentoBanco[];
    /** Facturas pagadas que ya quedaron vinculadas a otro movimiento. */
    vinculadas: Set<string>;
    /** RUT pagador → clientes por los que pagó antes. */
    aprendidos: Map<string, Set<string>>;
};
export declare function proponerCruce(mov: {
    rutPagador: string | null;
    referencia: string | null;
    monto: number;
    fecha: string;
}, ctx: Contexto): Propuesta;
export declare function importarCartola(params: {
    empresaKey: EmpresaKey;
    buffer: Buffer;
    archivo: string | null;
    responsable: string | null;
    aplicar: boolean;
    omitirPosibles?: boolean;
}): Promise<ResultadoImportacion>;
export declare function listarMovimientos(params: {
    empresaKey: EmpresaKey;
    docs: DocumentoBanco[];
    desde?: string | null;
    hasta?: string | null;
}): Promise<{
    movimientos: MovimientoVista[];
    resumen: Record<string, number>;
}>;
export declare function confirmarMovimiento(params: {
    empresaKey: EmpresaKey;
    movimientoId: number;
    asignaciones: Array<{
        tipoDoc: string;
        folio: string;
        rutContraparte: string;
        monto: number;
    }>;
    docs: DocumentoBanco[];
    responsable: string | null;
}): Promise<{
    abonos: number;
    vinculos: number;
}>;
/** Confirma en bloque los pendientes cuya propuesta es PERFECTO o YA_PAGADA (con la propuesta recalculada). */
export declare function confirmarPerfectos(params: {
    empresaKey: EmpresaKey;
    ids: number[];
    docs: DocumentoBanco[];
    responsable: string | null;
}): Promise<{
    confirmados: number;
    errores: {
        id: number;
        error: string;
    }[];
}>;
export declare function deshacerMovimiento(params: {
    empresaKey: EmpresaKey;
    movimientoId: number;
    docs: DocumentoBanco[];
}): Promise<void>;
export declare function descartarMovimiento(params: {
    empresaKey: EmpresaKey;
    movimientoId: number;
    motivo: string;
    observacion: string | null;
    responsable: string | null;
}): Promise<void>;
export declare function restaurarMovimiento(params: {
    empresaKey: EmpresaKey;
    movimientoId: number;
}): Promise<void>;
export {};
//# sourceMappingURL=conciliacion-bancaria.service.d.ts.map