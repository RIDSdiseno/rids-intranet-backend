// src/service/proteccion-datos/proteccion-datos.types.ts
import {
    EstadoCampaniaProteccionDatos,
    EstadoConsentimientoDatos,
    TipoEventoConsentimientoDatos,
} from "@prisma/client";


/* =========================================================
   FORMULARIO DINÁMICO
   ========================================================= */

export type TipoCampoConsentimiento =
    | "TEXT"
    | "CHECKBOX"
    | "RADIO";

export type OpcionCampoConsentimiento = {
    value: string;

    label: string;
};

export type CampoConsentimiento = {
    key: string;

    tipo:
    TipoCampoConsentimiento;

    label: string;

    descripcion?:
    string;

    obligatorio:
    boolean;

    placeholder?:
    string;

    opciones?:
    OpcionCampoConsentimiento[];

    documentos?:
    DocumentoCampoConsentimiento[];
};

/* =========================================================
   CONFIGURACIÓN
   ========================================================= */

export type ConfiguracionConsentimientoDatos = {
    schemaVersion:
    2;

    tituloFormulario:
    string;

    descripcionFormulario?:
    string;

    textoBoton:
    string;

    campos:
    CampoConsentimiento[];
};

/* =========================================================
   RESPUESTA
   ========================================================= */

export type ValorRespuestaConsentimiento =
    string |
    boolean;

export type RespuestasConsentimiento =
    Record<
        string,
        ValorRespuestaConsentimiento
    >;

export type RespuestaConsentimientoDatos = {
    aceptado: boolean;

    respuestas:
    RespuestasConsentimiento;
};

export type ResponderConsentimientoPublicoInput =
    RespuestaConsentimientoDatos;

/* =========================================================
   CAMPAÑAS
   ========================================================= */

export type CrearCampaniaProteccionDatosInput = {
    nombre: string;

    descripcion?: string | null;

    tituloDocumento: string;

    versionDocumento: string;

    contenidoHtml: string;

    configuracionConsentimiento?:
    ConfiguracionConsentimientoDatos | null;

    asuntoCorreo: string;

    cuerpoCorreoHtml: string;

    fechaInicio?: Date | null;

    fechaFin?: Date | null;

    creadoPorId?: number | null;
};

export type ActualizarCampaniaProteccionDatosInput = {
    nombre?: string;

    descripcion?: string | null;

    tituloDocumento?: string;

    versionDocumento?: string;

    contenidoHtml?: string;

    configuracionConsentimiento?:
    ConfiguracionConsentimientoDatos | null;

    asuntoCorreo?: string;

    cuerpoCorreoHtml?: string;

    fechaInicio?: Date | null;

    fechaFin?: Date | null;
};

/* =========================================================
   DESTINATARIOS
   ========================================================= */

export type AgregarDestinatariosCampaniaInput = {
    solicitanteIds: number[];
};

export type DestinatarioCampaniaOmitido = {
    solicitanteId: number;

    motivo: string;
};

export type ResultadoAgregarDestinatariosCampania = {
    agregados: number;

    omitidos: DestinatarioCampaniaOmitido[];
};

/* =========================================================
   FORMULARIO PÚBLICO
   ========================================================= */

export type DatosPublicosConsentimiento = {
    nombre: string | null;

    email: string;

    empresaNombre: string | null;

    tituloDocumento: string;

    versionDocumento: string;

    documentoHtml: string;

    configuracion:
    ConfiguracionConsentimientoDatos | null;

    estado: EstadoConsentimientoDatos;

    fechaRespuesta: Date | null;

    fechaRevocacion: Date | null;

    respuesta:
    RespuestaConsentimientoDatos | null;
};

/* =========================================================
   EVENTOS
   ========================================================= */

export type RegistrarEventoConsentimientoInput = {
    consentimientoId: number;

    tipo: TipoEventoConsentimientoDatos;

    detalle?: unknown;

    ip?: string | null;

    userAgent?: string | null;
};

/* =========================================================
   TOKENS
   ========================================================= */

export type TokenConsentimientoGenerado = {
    token: string;

    tokenHash: string;
};

/* =========================================================
   REENVÍO
   ========================================================= */

export type ReenviarConsentimientoInput = {
    consentimientoId: number;

    enviadoPorId?: number | null;
};

/* =========================================================
   ESTADOS PERMITIDOS
   ========================================================= */

export const ESTADOS_RESPONDIBLES: EstadoConsentimientoDatos[] = [
    EstadoConsentimientoDatos.PENDIENTE,
    EstadoConsentimientoDatos.ENVIADO,
];

export const ESTADOS_REVOCABLES: EstadoConsentimientoDatos[] = [
    EstadoConsentimientoDatos.ACEPTADO,
];

/* =========================================================
   RESPUESTA PÚBLICA
   ========================================================= */

export type RevocarConsentimientoPublicoInput = {
    motivo?: string | null;
};

export type DocumentoCampoConsentimiento = {
    titulo:
    string;

    nombre:
    string;

    path:
    string;

    contentType:
    string;

    size:
    number;

    sha256:
    string;
};