type ResultadoEnvioDestinatario = {
    consentimientoId: number;
    email: string;
    ok: boolean;
    error?: string;
};
export type ResultadoEnvioCampania = {
    campaniaId: number;
    procesados: number;
    enviados: number;
    errores: number;
    resultados: ResultadoEnvioDestinatario[];
};
export declare function enviarCampaniaProteccionDatos(campaniaId: number): Promise<ResultadoEnvioCampania>;
export type ResultadoRecordatorioCampania = ResultadoEnvioCampania & {
    /** Recibieron un correo hace menos de RECORDATORIO_INTERVALO_HORAS. */
    omitidos: number;
};
export declare function enviarRecordatorioCampaniaProteccionDatos(campaniaId: number, consentimientoIds?: number[]): Promise<ResultadoRecordatorioCampania>;
export {};
//# sourceMappingURL=proteccion-datos-email.service.d.ts.map