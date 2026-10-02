export type ActualizarSuscripcionContratoInput = Partial<CrearSuscripcionContratoInput>;
export type SuscripcionEjecutivoInput = {
    id?: number;
    nombre: string;
    email?: string | null;
    telefono?: string | null;
    principal?: boolean;
};
export type SuscripcionContactoSoporteInput = {
    id?: number;
    nombre?: string | null;
    email?: string | null;
    telefono?: string | null;
    principal?: boolean;
};
export type CrearSuscripcionContratoInput = {
    proveedor: string;
    fabricante: string;
    productoPlan: string;
    cantidadLicencias?: number;
    costoMensual?: number | null;
    moneda?: string;
    fechaInicio?: string | null;
    fechaTermino?: string | null;
    fechaRenovacion?: string | null;
    numeroContrato?: string | null;
    numeroOferta?: string | null;
    observaciones?: string | null;
    activo?: boolean;
    ejecutivosComerciales?: SuscripcionEjecutivoInput[];
    contactosSoporte?: SuscripcionContactoSoporteInput[];
};
//# sourceMappingURL=suscripciones-contratos.types.d.ts.map