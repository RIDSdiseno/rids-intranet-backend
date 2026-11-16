/** Días antes del hito en que se avisa (orden ascendente). */
export declare const UMBRALES_AVISO: readonly number[];
/** "YYYY-MM-DD" del día en Chile para un instante. */
export declare function diaChile(fecha: Date): string;
/** Hora actual en Chile (0-23). */
export declare function horaChileActual(): number;
export type CambioEstadoLicitacion = {
    id: number;
    codigoExterno: string;
    anterior?: number | null | undefined;
    nuevo?: number | undefined;
    texto?: string | null | undefined;
};
export type ResultadoAvisosLicitaciones = {
    hoy: string;
    simulado: boolean;
    hitosEnRango: number;
    avisos: number;
    /** De `avisos`, cuántos son de licitaciones NUEVA (sin revisar). */
    avisosNuevas: number;
    sinDestinatarios: number;
    cambiosEstado: number;
    correos: Array<{
        to: string;
        hitos: number;
        cambios: number;
        ok: boolean;
        error?: string;
    }>;
    detalle: Array<{
        codigoExterno: string;
        tipo: string;
        dias: number;
        umbral: number;
        destinatarios: string[];
    }>;
};
export declare function procesarAvisosLicitaciones(opciones?: {
    cambiosEstado?: CambioEstadoLicitacion[];
    /** true = arma los correos y devuelve el detalle, sin enviar ni registrar. */
    simular?: boolean;
}): Promise<ResultadoAvisosLicitaciones>;
//# sourceMappingURL=mercado-publico-avisos.service.d.ts.map