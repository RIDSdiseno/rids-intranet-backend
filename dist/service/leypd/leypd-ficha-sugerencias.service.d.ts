export interface SugerenciaFichaLeypd {
    valor: string | number | boolean | null;
    fuente: "CRM";
    confirmado: false;
    actualizadoPor: null;
    fecha: null;
}
export interface ContactoFichaLeypd {
    id: number;
    nombre: string;
    cargo: string;
    email: string | null;
    telefono: string | null;
    principal: boolean;
    sucursal: string | null;
}
export interface ContactosFichaLeypd {
    /** Correo y teléfono de la empresa (ficha de empresa › Cliente). */
    contactoEmpresa: {
        email: string | null;
        telefono: string | null;
    } | null;
    /** Contactos de la ficha de empresa, principal primero. */
    contactos: ContactoFichaLeypd[];
}
/**
 * Datos para que RIDS elija un contacto del CRM en la ficha Ley PD.
 * No se guardan solos: solo completan el texto de la pregunta.
 */
export declare function obtenerContactosFichaLeypd(empresaId: number): Promise<ContactosFichaLeypd>;
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