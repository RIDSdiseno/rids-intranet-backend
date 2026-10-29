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
export {};
//# sourceMappingURL=proteccion-datos-email.service.d.ts.map