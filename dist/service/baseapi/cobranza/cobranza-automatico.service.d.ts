import { type EmpresaKey } from "./cobranza-estado.service.js";
export type TipoRecordatorioCobranza = "POR_VENCER_7_DIAS" | "POR_VENCER_3_DIAS" | "VENCE_HOY" | "VENCIDA_3_DIAS" | "VENCIDA_7_DIAS" | "VENCIDA_15_DIAS" | "VENCIDA_30_DIAS" | `POR_VENCER_${number}_DIAS` | `VENCIDA_${number}_DIAS`;
export type DestinatarioCobranza = {
    contactoId: number;
    nombre: string;
    email: string;
    cargo: string | null;
    principal: boolean;
};
export type CandidatoRecordatorioCobranza = {
    empresaKey: EmpresaKey;
    tipoRcv: "ventas";
    tipoDoc: string;
    folio: string;
    rutContraparte: string;
    razonSocial: string | null;
    montoTotal: number;
    montoOriginal: number;
    montoNotasCredito: number;
    montoPendiente: number;
    notasCreditoAplicadas: {
        folio: string;
        montoTotal: number;
        codigoRef: string | null;
        razonRef: string | null;
    }[];
    fechaVencimiento: string;
    diasDiferencia: number;
    origenVencimiento: "MANUAL" | "DTE_CACHE" | "DTE" | "DIAS_CREDITO" | "RCV" | "DESCONOCIDO";
    diasCredito: number | null;
    estadoPago: "PENDIENTE" | "VENCIDA";
    tipoRecordatorio: TipoRecordatorioCobranza;
    yaEnviado: boolean;
    recordatoriosPendientes: number;
    recordatoriosEnviados: number;
    recordatoriosError: number;
    periodoOrigen: string;
    empresaClienteId: number | null;
    empresaClienteNombre: string | null;
    destinatarios: DestinatarioCobranza[];
    tieneDestinatarioCobranza: boolean;
};
export type ResultadoCobranzaEmpresa = {
    empresa: EmpresaKey;
    configurada: boolean;
    activa: boolean;
    envioAutomatico: boolean;
    documentosAnalizados: number;
    confirmadosOmitidos: number;
    sinFechaVencimiento: number;
    sinIdentificacion: number;
    candidatos: number;
    yaEnviados: number;
    pendientesEnvio: number;
    detalle: CandidatoRecordatorioCobranza[];
    candidatosConDestinatario: number;
    candidatosSinDestinatario: number;
    error?: string;
};
export type ResultadoCobranzaAutomatica = {
    modo: "SIMULACION";
    generadoAt: Date;
    mesesAnalizados: number;
    empresas: ResultadoCobranzaEmpresa[];
    totalDocumentos: number;
    totalCandidatos: number;
    totalYaEnviados: number;
    totalPendientesEnvio: number;
};
export declare function procesarCobranzaAutomatica(options?: {
    mesesAnalizar?: number;
    empresas?: EmpresaKey[];
    registrarPendientes?: boolean;
}): Promise<ResultadoCobranzaAutomatica>;
//# sourceMappingURL=cobranza-automatico.service.d.ts.map