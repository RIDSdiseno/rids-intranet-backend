export type EstadoPagoRcv = "CONFIRMADA" | "PENDIENTE" | "VENCIDA";
export type EmpresaKey = "econnet" | "rids";
export type EstadoDocumentoCobranza = {
    estadoPago: EstadoPagoRcv;
    fechaVencimiento: Date | null;
    fechaVencimientoIso: string | null;
    diasDiferencia: number | null;
    conciliada: boolean;
    origenVencimiento: "OVERRIDE" | "DOCUMENTO" | "SIN_FECHA";
};
/**
 * Convención:
 *
 * -7 = faltan 7 días para vencer
 * -3 = faltan 3 días
 *  0 = vence hoy
 *  3 = venció hace 3 días
 *  7 = venció hace 7 días
 */
export declare function getDiasCobranza(fechaVencimiento: Date, referencia?: Date): number;
export type TipoRcvCobranza = "ventas" | "compras";
export declare function obtenerEstadoDocumentoCobranza(doc: any, tipoRcv: TipoRcvCobranza, empresaFallback?: EmpresaKey): Promise<EstadoDocumentoCobranza>;
export declare function anotarDocumentoCobranza(doc: any, tipoRcv: TipoRcvCobranza, empresaFallback?: EmpresaKey): Promise<any>;
type DocumentoCobranzaBatch = {
    documento: any;
    estado: EstadoDocumentoCobranza;
};
export declare function obtenerEstadosDocumentosCobranza(documentos: any[], tipoRcv: TipoRcvCobranza, empresaFallback?: EmpresaKey): Promise<DocumentoCobranzaBatch[]>;
export declare function anotarDocumentosCobranza(documentos: any[], tipoRcv: TipoRcvCobranza, empresaFallback?: EmpresaKey): Promise<any[]>;
export {};
//# sourceMappingURL=cobranza-estado.service.d.ts.map