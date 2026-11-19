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
/** Saldo mínimo para recordatorios automáticos (CLP). */
export declare const SALDO_MINIMO_COBRANZA_AUTO = 10000;
/** Más allá de estos días de vencida no hay recordatorios automáticos (decisión 19-11-2026). */
export declare const MAX_DIAS_VENCIDA_COBRANZA_AUTO = 180;
/**
 * Etapa de recordatorio para un documento.
 * diasDiferencia: > 0 días vencido, < 0 faltan días, 0 vence hoy.
 */
export declare function getEtapaRecordatorioCxc(diasDiferencia: number, diasPorVencer: number[], diasVencidos: number[], opciones?: {
    /** Calcula la etapa aunque pase el tope de días (para mostrar exclusiones). */
    ignorarTope?: boolean;
    /** Solo la etapa de ese día exacto, sin ventana de recuperación (calendario de próximos días). */
    exacto?: boolean;
}): TipoRecordatorioCobranza | null;
export type MotivoExclusionCobranzaCxc = "BAJO_MINIMO" | "SOBRE_TOPE";
export type ExclusionCobranzaCxc = {
    tipoDoc: string;
    folio: string;
    rutContraparte: string;
    razonSocial: string | null;
    saldo: number;
    fechaVencimiento: string;
    diasDiferencia: number;
    tipoRecordatorio: TipoRecordatorioCobranza;
    motivo: MotivoExclusionCobranzaCxc;
};
export type DiaCalendarioCobranzaCxc = {
    /** YYYY-MM-DD (Chile) */
    fecha: string;
    /** 0 = hoy */
    desplazamiento: number;
    candidatos: CandidatoRecordatorioCobranza[];
    excluidos: ExclusionCobranzaCxc[];
};
/**
 * Qué facturas llegan a una etapa hoy y en los próximos días.
 * - Hoy: mismas reglas que la preparación (con la ventana de recuperación) y el estado de envío.
 * - Días siguientes: solo la etapa exacta de ese día (sin ventana), para no repetir facturas.
 * - Excluidos: facturas que llegarían a una etapa pero quedan fuera por saldo mínimo o por el tope de días.
 * No refresca el RCV ni registra nada.
 */
export declare function calendarioCobranzaCxc(empresa: EmpresaKey, diasAdelante: number): Promise<DiaCalendarioCobranzaCxc[]>;
export declare function procesarCobranzaAutomatica(options?: {
    mesesAnalizar?: number;
    empresas?: EmpresaKey[];
    registrarPendientes?: boolean;
    /**
     * CXC (por defecto, Fase 5a): núcleo de cuentas por cobrar.
     * LEGACY: lógica anterior (solo para comparar o volver atrás).
     */
    motor?: "CXC" | "LEGACY";
    /** Refrescar el RCV del mes en curso antes de preparar (por defecto, solo al registrar). */
    refrescarRcv?: boolean;
}): Promise<ResultadoCobranzaAutomatica>;
//# sourceMappingURL=cobranza-automatico.service.d.ts.map