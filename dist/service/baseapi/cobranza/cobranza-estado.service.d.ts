export type EstadoPagoRcv = "PAGADA" | "PENDIENTE" | "VENCIDA";
export type EmpresaKey = "econnet" | "rids";
export type EstadoDocumentoCobranza = {
    estadoPago: EstadoPagoRcv;
    fechaVencimiento: Date | null;
    fechaVencimientoIso: string | null;
    diasDiferencia: number | null;
    conciliada: boolean;
    origenVencimiento: "OVERRIDE" | "DOCUMENTO" | "DTE_CACHE" | "RECEPTOR_COBRANZA" | "DETALLE_EMPRESA" | "SIN_FECHA";
};
export type EstadoAutomatizacionCobranza = "SIN_RECORDATORIOS" | "ENVIADO" | "PENDIENTE" | "PROCESANDO" | "ERROR" | "PARCIAL";
export type DestinatarioAutomatizacionCobranza = {
    email: string;
    nombre: string | null;
    estado: string;
    enviadoAt: Date | null;
    error: string | null;
    intentos: number;
};
export type HistorialAutomatizacionCobranza = {
    id: number;
    tipoRecordatorio: string;
    cicloVencimiento: string | null;
    email: string;
    nombre: string | null;
    estado: string;
    enviadoAt: Date | null;
    error: string | null;
    intentos: number;
    ultimoIntentoAt: Date | null;
    createdAt: Date;
};
export type ResumenAutomatizacionCobranza = {
    tieneHistorial: boolean;
    estado: EstadoAutomatizacionCobranza;
    total: number;
    enviados: number;
    pendientes: number;
    procesando: number;
    errores: number;
    ultimoEnvioAt: Date | null;
    ultimoRegistroAt: Date | null;
    ultimoTipoRecordatorio: string | null;
    ultimoCicloVencimiento: string | null;
    destinatarios: DestinatarioAutomatizacionCobranza[];
    historial: HistorialAutomatizacionCobranza[];
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
    automatizacion: ResumenAutomatizacionCobranza;
};
export declare function obtenerEstadosDocumentosCobranza(documentos: any[], tipoRcv: TipoRcvCobranza, empresaFallback?: EmpresaKey): Promise<DocumentoCobranzaBatch[]>;
export declare function anotarDocumentosCobranza(documentos: any[], tipoRcv: TipoRcvCobranza, empresaFallback?: EmpresaKey): Promise<any[]>;
export {};
//# sourceMappingURL=cobranza-estado.service.d.ts.map