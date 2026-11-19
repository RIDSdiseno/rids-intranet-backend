import type { EmpresaKey } from "./cobranza-estado.service.js";
export declare class CobranzaPanelError extends Error {
}
export type ConfigCobranzaVista = {
    empresaKey: EmpresaKey;
    activo: boolean;
    envioAutomatico: boolean;
    adjuntarPdf: boolean;
    horaConsultaSii: string;
    horaCobranza: string;
    diasPorVencer: number[];
    diasVencidos: number[];
    updatedAt: string;
};
export type ReglasFijasCobranza = {
    saldoMinimo: number;
    topeDiasVencida: number;
    repetirCadaDias: number;
    diasRecuperacion: number;
};
export declare const REGLAS_FIJAS_COBRANZA: ReglasFijasCobranza;
export declare function obtenerConfigCobranza(): Promise<ConfigCobranzaVista[]>;
export type CambiosConfigCobranza = Partial<{
    activo: boolean;
    envioAutomatico: boolean;
    adjuntarPdf: boolean;
    horaConsultaSii: string;
    horaCobranza: string;
    diasPorVencer: number[];
    diasVencidos: number[];
}>;
/** Valida y guarda los cambios. La preparación debe ser antes del envío. */
export declare function actualizarConfigCobranza(empresaKey: EmpresaKey, body: Record<string, unknown>): Promise<ConfigCobranzaVista>;
export type RecordatorioColaVista = {
    id: number;
    empresaKey: string;
    tipoDoc: string;
    folio: string;
    rutContraparte: string;
    razonSocial: string | null;
    tipoRecordatorio: string;
    emailDestino: string;
    nombreDestino: string | null;
    estado: string;
    automatico: boolean;
    montoTotal: number;
    fechaVencimiento: string | null;
    diasDiferencia: number | null;
    asunto: string | null;
    error: string | null;
    intentos: number;
    /** Fecha (Chile) en que se preparó. */
    fecha: string;
    hora: string;
    enviadoAt: string | null;
    horaEnvio: string | null;
};
export type ColaCobranzaVista = {
    filas: RecordatorioColaVista[];
    porEstado: Record<string, number>;
    truncado: boolean;
};
export declare function listarColaCobranza(params: {
    empresaKey: EmpresaKey;
    desde: string;
    hasta: string;
    estado?: string;
}): Promise<ColaCobranzaVista>;
/** Solo PENDIENTE o ERROR (lo que el envío todavía podría mandar). */
export declare function cancelarRecordatorioCobranza(id: number, responsable: string | null): Promise<void>;
//# sourceMappingURL=cobranza-panel.service.d.ts.map