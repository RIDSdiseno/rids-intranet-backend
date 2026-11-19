import type { EmpresaKey } from "../cobranza/cobranza-estado.service.js";
/** Lo que se usa del documento del núcleo (DocumentoCxc). */
export type DocumentoAbonoCxc = {
    tipoDoc: string;
    folio: string;
    rutContraparte: string;
    razonSocial: string | null;
    fechaEmision: string | null;
    montoOriginal: number;
    montoNotasCredito: number;
    estado: "PAGADO" | "PENDIENTE" | "VENCIDO" | "COMPENSADO";
};
export type AbonoCxc = {
    id: number;
    monto: number;
    fechaPago: string;
    formaPago: string | null;
    observacion: string | null;
    origen: string;
    responsable: string | null;
    createdAt: string;
};
export type PagosDocumentoCxc = {
    montoOriginal: number;
    montoNotasCredito: number;
    /** Monto − NC. */
    saldoNc: number;
    montoAbonado: number;
    pendiente: number;
    /** Conciliada (pagada) en RcvConciliacion. */
    conciliada: boolean;
    /** Conciliada sin abonos (Duemint o el «Registrar pago» anterior). */
    conciliadaSinAbonos: boolean;
    conciliadoAt: string | null;
    formaPagoConciliacion: string | null;
    abonos: AbonoCxc[];
};
export declare class AbonoCxcError extends Error {
}
export declare function obtenerPagosDocumentoCxc(empresaKey: EmpresaKey, doc: DocumentoAbonoCxc): Promise<PagosDocumentoCxc>;
export declare function registrarAbonoCxc(params: {
    empresaKey: EmpresaKey;
    documento: DocumentoAbonoCxc;
    monto: number;
    fechaPago: string;
    formaPago: string | null;
    observacion: string | null;
    responsable: string | null;
    /** Fase 4b: abono creado al conciliar un movimiento de la cartola. */
    origen?: "MANUAL" | "CARTOLA";
    movimientoId?: number | null;
}): Promise<{
    pagos: PagosDocumentoCxc;
    conciliada: boolean;
    abonoId: number;
}>;
export declare function eliminarAbonoCxc(params: {
    empresaKey: EmpresaKey;
    documento: DocumentoAbonoCxc;
    abonoId: number;
    /** true solo desde la conciliación bancaria (deshacer un movimiento). */
    desdeMovimiento?: boolean;
}): Promise<{
    pagos: PagosDocumentoCxc;
    desconciliada: boolean;
}>;
//# sourceMappingURL=cxc-abonos.service.d.ts.map