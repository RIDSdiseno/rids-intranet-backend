export declare const CAMPOS_SUGERIBLES_FICHA_TECNICA: readonly ["tecnicoPrincipal", "tecnicosRespaldo", "pcsNotebooks", "servidores", "impresorasPerifericos", "routersSwitches", "sistemasOperativos", "licenciasVigentes", "antivirusSeguridad", "proveedorInternet", "velocidadContratada", "configuracionIP", "correosCorporativos"];
export type CampoSugeribleFichaTecnica = (typeof CAMPOS_SUGERIBLES_FICHA_TECNICA)[number];
export type SugerenciaFichaTecnica = {
    valor: string;
    fuente: string;
};
export type VisitasCrmFichaTecnica = {
    /** Última visita COMPLETADA. fecha en dd-mm-aaaa (hora de Chile). */
    ultima: {
        fecha: string;
        tecnico: string | null;
    } | null;
    /** Próxima visita en agenda (hoy o después). fecha en dd-mm-aaaa. */
    proxima: {
        fecha: string;
        hora: string | null;
        tecnicos: string[];
    } | null;
};
export type DatosCrmFichaTecnica = {
    visitas: VisitasCrmFichaTecnica;
    sugerencias: Partial<Record<CampoSugeribleFichaTecnica, SugerenciaFichaTecnica>>;
};
/** Agenda que todavía no ocurre (o está en curso). */
export declare const ESTADOS_AGENDA_PENDIENTE: readonly ["PROGRAMADA", "NOTIFICADA", "EN_RUTA", "INICIADA"];
export declare function obtenerVisitasCrmFichaTecnica(empresaId: number): Promise<VisitasCrmFichaTecnica>;
export declare function obtenerDatosCrmFichaTecnica(empresaId: number): Promise<DatosCrmFichaTecnica>;
//# sourceMappingURL=ficha-tecnica-crm.service.d.ts.map