export interface SugerenciaFichaLeypd {
    valor: string | number | boolean | null;
    fuente: "CRM";
    confirmado: false;
    actualizadoPor: null;
    fecha: null;
}
export declare function obtenerSugerenciasFichaLeypd(empresaId: number): Promise<{
    razonSocial: SugerenciaFichaLeypd;
    rut: SugerenciaFichaLeypd;
    domicilioLegal: SugerenciaFichaLeypd;
    sitioWeb: SugerenciaFichaLeypd;
    hostingProveedor: SugerenciaFichaLeypd;
    contactoOficialEmpresa: SugerenciaFichaLeypd;
    responsableDerechosTitulares: SugerenciaFichaLeypd;
    responsableIncidentesSeguridad: SugerenciaFichaLeypd;
}>;
//# sourceMappingURL=leypd-ficha-sugerencias.service.d.ts.map