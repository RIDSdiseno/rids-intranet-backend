export declare const MINIMO_DOCUMENTOS_SCORE = 5;
export type EstadoPuntualidadCliente = "SIN_HISTORIAL" | "EXCELENTE" | "BUEN_PAGADOR" | "IRREGULAR" | "RIESGO_MORA";
export type EvaluacionDocumentoPuntualidad = {
    valido: boolean;
    diasAtraso: number;
    puntaje: number;
};
export type ResumenPuntualidad = {
    estado: EstadoPuntualidadCliente;
    score: number | null;
    totalEvaluados: number;
    aTiempo: number;
    atrasadas: number;
    porcentajeATiempo: number;
    promedioDiasAtraso: number;
    documentosInvalidos: number;
};
export declare function diferenciaDiasCalendario(desde: Date, hasta: Date): number;
export declare function puntajePorDiasAtraso(diasAtraso: number): number;
export declare function evaluarDocumentoPuntualidad(params: {
    fechaDocto: Date | null;
    fechaVencimiento: Date;
    fechaPago: Date;
}): EvaluacionDocumentoPuntualidad;
export declare function calcularResumenPuntualidad(params: {
    totalEvaluados: number;
    aTiempo: number;
    atrasadas: number;
    sumaDiasAtraso: number;
    sumaPuntajes: number;
    documentosInvalidos?: number;
}): ResumenPuntualidad;
//# sourceMappingURL=puntualidad-cliente.service.d.ts.map