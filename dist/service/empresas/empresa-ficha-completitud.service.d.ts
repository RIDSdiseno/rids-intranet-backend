export type EstadoCompletitudSeccion = "COMPLETA" | "INCOMPLETA" | "SIN_DATOS" | "NO_APLICA";
export type FaltanteFichaEmpresa = {
    campo: string;
    label: string;
    registro?: string;
};
export type CompletitudSeccionFicha = {
    key: string;
    label: string;
    obligatoria: boolean;
    estado: EstadoCompletitudSeccion;
    porcentaje: number;
    totalCampos: number;
    camposCompletos: number;
    faltantes: FaltanteFichaEmpresa[];
};
export type CompletitudFichaEmpresa = {
    estado: "COMPLETA" | "INCOMPLETA";
    porcentaje: number;
    totalSecciones: number;
    seccionesCompletas: number;
    seccionesIncompletas: number;
    totalFaltantes: number;
    secciones: CompletitudSeccionFicha[];
};
export declare const CHECKLIST_LABELS: {
    readonly levantamientoEquipos: "Levantamiento de equipos";
    readonly inventarioSoftware: "Inventario de software";
    readonly soporteComputacional: "Soporte computacional";
    readonly sitiosWeb: "Sitios web";
    readonly visitasPresenciales: "Visitas presenciales";
    readonly contratoFirmado: "Contrato firmado";
    readonly facturasArchivadas: "Facturas archivadas";
    readonly historialIncidencias: "Historial de incidencias";
    readonly reunionesRevision: "Reuniones de revisión";
    readonly registroAccesos: "Registro de accesos";
    readonly metasDigitales: "Metas digitales";
    readonly planAccion: "Plan de acción";
};
export declare const FICHA_TECNICA_LABELS: {
    readonly tecnicoPrincipal: "Técnico principal";
    readonly tecnicosRespaldo: "Técnicos de respaldo";
    readonly sistemasOperativos: "Sistemas operativos";
    readonly proveedorInternet: "Proveedor de Internet";
    readonly dominioWeb: "Dominio web";
    readonly antivirusSeguridad: "Antivirus / seguridad";
    readonly aplicacionesCriticas: "Aplicaciones críticas";
    readonly certificadoSSL: "Certificado SSL";
    readonly configuracionIP: "Configuración IP";
    readonly correosCorporativos: "Correos corporativos";
    readonly fechaUltimaVisita: "Fecha última visita";
    readonly hostingProveedor: "Proveedor de hosting";
    readonly impresorasPerifericos: "Impresoras / periféricos";
    readonly licenciasVigentes: "Licencias vigentes";
    readonly otrosEquipos: "Otros equipos";
    readonly pcsNotebooks: "PCs / notebooks";
    readonly proximaVisitaProgramada: "Próxima visita programada";
    readonly routersSwitches: "Routers / switches";
    readonly servidores: "Descripción de servidores";
    readonly velocidadContratada: "Velocidad contratada";
};
export declare function evaluarCompletitudFichasEmpresas(empresaIds: number[]): Promise<Map<number, CompletitudFichaEmpresa>>;
//# sourceMappingURL=empresa-ficha-completitud.service.d.ts.map