export type TipoFechaAviso = "RENOVACION" | "TERMINO";
/** Días de anticipación, de menor a mayor. SUSCRIPCIONES_AVISO_DIAS="30,15,7,1,0" */
export declare function umbralesAviso(): number[];
/** Días después de vencida para el seguimiento. SUSCRIPCIONES_AVISO_DIAS_VENCIDOS="1,7,30" */
export declare function umbralesVencidos(): number[];
/** Hora del día (Chile) en que corre el aviso. SUSCRIPCIONES_AVISO_HORA=8 */
export declare function horaAviso(): number;
/** Normaliza una lista de correos: minúsculas, sin repetidos, solo válidos. */
export declare function normalizarListaCorreos(valor: string | string[] | null | undefined): string[];
/** "YYYY-MM-DD" de hoy en Chile. */
export declare function hoyChile(): string;
/** Hora actual en Chile (0-23). */
export declare function horaChileActual(): number;
export type AvisoPlanificado = {
    suscripcionId: number;
    empresaId: number;
    empresa: string;
    fabricante: string;
    productoPlan: string;
    proveedor: string;
    cantidadLicencias: number;
    costo: string;
    numeroContrato: string | null;
    ejecutivo: string | null;
    tipoFecha: TipoFechaAviso;
    /** YYYY-MM-DD */
    fecha: string;
    /** Días que faltan; negativo = vencida hace N días. */
    dias: number;
    /** Umbral avisado; negativo = seguimiento de vencida. */
    umbral: number;
    destinatarios: string[];
};
export type VencidoAcompanante = Omit<AvisoPlanificado, "umbral">;
export type ResultadoAvisos = {
    hoy: string;
    simulado: boolean;
    /** Avisos que tocaban hoy (en simulación) o que se reservaron. */
    avisos: number;
    /** Avisos que se enviaron a al menos un destinatario. */
    enviados: number;
    /** Fechas que tocaba avisar pero sin ningún destinatario. */
    sinDestinatarios: number;
    /** Vencidos sin actualizar que van como acompañantes en los correos. */
    vencidos: number;
    recordatorios: number;
    correos: Array<{
        to: string;
        avisos: number;
        vencidos: number;
        ok: boolean;
        error?: string;
    }>;
    planificados: AvisoPlanificado[];
    acompanantes: VencidoAcompanante[];
};
export declare function construirCorreoAvisos(items: VencidoAcompanante[]): {
    subject: string;
    bodyHtml: string;
};
export declare function procesarAvisosSuscripciones(opciones?: {
    /** No reserva ni envía: solo devuelve lo que se avisaría. */
    simular?: boolean;
    /** "YYYY-MM-DD" para probar otro día. Por defecto hoy en Chile. */
    hoy?: string;
}): Promise<ResultadoAvisos>;
//# sourceMappingURL=suscripciones-avisos.service.d.ts.map