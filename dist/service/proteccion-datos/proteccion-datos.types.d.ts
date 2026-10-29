import { EstadoConsentimientoDatos, TipoEventoConsentimientoDatos } from "@prisma/client";
export type TipoCampoConsentimiento = "TEXT" | "CHECKBOX" | "RADIO";
export type OpcionCampoConsentimiento = {
    value: string;
    label: string;
};
export type CampoConsentimiento = {
    key: string;
    tipo: TipoCampoConsentimiento;
    label: string;
    descripcion?: string;
    obligatorio: boolean;
    placeholder?: string;
    opciones?: OpcionCampoConsentimiento[];
    documentos?: DocumentoCampoConsentimiento[];
};
export type ConfiguracionConsentimientoDatos = {
    schemaVersion: 2;
    tituloFormulario: string;
    descripcionFormulario?: string;
    textoBoton: string;
    campos: CampoConsentimiento[];
};
export type ValorRespuestaConsentimiento = string | boolean;
export type RespuestasConsentimiento = Record<string, ValorRespuestaConsentimiento>;
export type RespuestaConsentimientoDatos = {
    aceptado: boolean;
    respuestas: RespuestasConsentimiento;
};
export type ResponderConsentimientoPublicoInput = RespuestaConsentimientoDatos;
export type CrearCampaniaProteccionDatosInput = {
    nombre: string;
    descripcion?: string | null;
    tituloDocumento: string;
    versionDocumento: string;
    contenidoHtml: string;
    configuracionConsentimiento?: ConfiguracionConsentimientoDatos | null;
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
    configuracionConsentimiento?: ConfiguracionConsentimientoDatos | null;
    asuntoCorreo?: string;
    cuerpoCorreoHtml?: string;
    fechaInicio?: Date | null;
    fechaFin?: Date | null;
};
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
export type DatosPublicosConsentimiento = {
    nombre: string | null;
    email: string;
    empresaNombre: string | null;
    tituloDocumento: string;
    versionDocumento: string;
    documentoHtml: string;
    configuracion: ConfiguracionConsentimientoDatos | null;
    estado: EstadoConsentimientoDatos;
    fechaRespuesta: Date | null;
    fechaRevocacion: Date | null;
    respuesta: RespuestaConsentimientoDatos | null;
};
export type RegistrarEventoConsentimientoInput = {
    consentimientoId: number;
    tipo: TipoEventoConsentimientoDatos;
    detalle?: unknown;
    ip?: string | null;
    userAgent?: string | null;
};
export type TokenConsentimientoGenerado = {
    token: string;
    tokenHash: string;
};
export type ReenviarConsentimientoInput = {
    consentimientoId: number;
    enviadoPorId?: number | null;
};
export declare const ESTADOS_RESPONDIBLES: EstadoConsentimientoDatos[];
export declare const ESTADOS_REVOCABLES: EstadoConsentimientoDatos[];
export type RevocarConsentimientoPublicoInput = {
    motivo?: string | null;
};
export type DocumentoCampoConsentimiento = {
    titulo: string;
    nombre: string;
    path: string;
    contentType: string;
    size: number;
    sha256: string;
};
//# sourceMappingURL=proteccion-datos.types.d.ts.map