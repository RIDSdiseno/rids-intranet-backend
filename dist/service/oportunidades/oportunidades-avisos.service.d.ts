/** Días antes de la fecha en que se avisa (orden ascendente). */
export declare const UMBRALES_AVISO_FUNNEL: readonly number[];
export type TipoFechaOportunidad = "PROXIMA_ACCION" | "COMPROMISO_ENVIO" | "VENCIMIENTO_PROPUESTA" | "REACTIVACION";
/** Hora actual en Chile (0-23). */
export declare function horaChileActualFunnel(): number;
export type ResultadoAvisosFunnel = {
    hoy: string;
    simulado: boolean;
    oportunidadesRevisadas: number;
    avisos: number;
    sinDestinatario: number;
    correos: Array<{
        to: string;
        avisos: number;
        ok: boolean;
        error?: string;
    }>;
    detalle: Array<{
        codigo: string;
        tipoFecha: TipoFechaOportunidad;
        dia: string;
        dias: number;
        umbral: number;
        destinatario: string;
    }>;
};
export declare function procesarAvisosFunnel(opciones?: {
    /** true = arma los correos y devuelve el detalle, sin enviar ni registrar. */
    simular?: boolean;
}): Promise<ResultadoAvisosFunnel>;
//# sourceMappingURL=oportunidades-avisos.service.d.ts.map