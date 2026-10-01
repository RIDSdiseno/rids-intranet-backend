// src/service/suscripciones-contratos/suscripciones-contratos.types.ts
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

    ejecutivoNombre?: string | null;
    ejecutivoEmail?: string | null;
    ejecutivoTelefono?: string | null;

    soporteTelefono?: string | null;
    soporteEmail?: string | null;

    observaciones?: string | null;

    activo?: boolean;
};

export type ActualizarSuscripcionContratoInput =
    Partial<CrearSuscripcionContratoInput>;