import type { ResponderConsentimientoPublicoInput, RevocarConsentimientoPublicoInput } from "./proteccion-datos.types.js";
export declare class ProteccionDatosPublicError extends Error {
    statusCode: number;
    code: string;
    constructor(statusCode: number, code: string, message: string);
}
type ContextoRequestPublico = {
    ip?: string | null;
    userAgent?: string | null;
};
export declare function obtenerConsentimientoPublico(token: string, contexto?: ContextoRequestPublico): Promise<{
    nombre: string | null;
    email: string;
    empresaNombre: string | null;
    documento: {
        titulo: string;
        version: string;
        html: string;
        hash: string;
    };
    configuracion: {
        campos: Omit<{
            documentos: {
                titulo: string;
                nombre: string;
                contentType: string;
                size: number;
                sha256: string;
                url: string;
            }[];
            key: string;
            tipo: import("./proteccion-datos.types.js").TipoCampoConsentimiento;
            label: string;
            descripcion?: string;
            obligatorio: boolean;
            placeholder?: string;
            opciones?: import("./proteccion-datos.types.js").OpcionCampoConsentimiento[];
            documentosLeypd?: import("./proteccion-datos.types.js").DocumentoLeypdCampoConsentimiento[];
        }, "documentosLeypd">[];
        schemaVersion: 2;
        tituloFormulario: string;
        descripcionFormulario?: string;
        textoBoton: string;
    } | null;
    estado: import("@prisma/client").$Enums.EstadoConsentimientoDatos;
    /** Fecha límite para responder (informativa en el formulario). */
    plazo: Date | null;
    respondido: boolean;
    fechaRespuesta: Date | null;
    fechaRevocacion: Date | null;
    respuesta: import("./proteccion-datos.types.js").RespuestaConsentimientoDatos | null;
}>;
/**
 * PDF de un documento Ley PD de la empresa del destinatario,
 * referenciado en campo.documentosLeypd[indice].
 */
export declare function obtenerDocumentoLeypdPublico(token: string, campoKey: string, indice: number, contexto?: ContextoRequestPublico): Promise<{
    nombre: string;
    contenido: Buffer<ArrayBufferLike>;
}>;
export declare function responderConsentimientoPublico(token: string, input: ResponderConsentimientoPublicoInput, contexto?: ContextoRequestPublico): Promise<{
    nombre: string | null;
    email: string;
    empresaNombre: string | null;
    documento: {
        titulo: string;
        version: string;
        html: string;
        hash: string;
    };
    configuracion: {
        campos: Omit<{
            documentos: {
                titulo: string;
                nombre: string;
                contentType: string;
                size: number;
                sha256: string;
                url: string;
            }[];
            key: string;
            tipo: import("./proteccion-datos.types.js").TipoCampoConsentimiento;
            label: string;
            descripcion?: string;
            obligatorio: boolean;
            placeholder?: string;
            opciones?: import("./proteccion-datos.types.js").OpcionCampoConsentimiento[];
            documentosLeypd?: import("./proteccion-datos.types.js").DocumentoLeypdCampoConsentimiento[];
        }, "documentosLeypd">[];
        schemaVersion: 2;
        tituloFormulario: string;
        descripcionFormulario?: string;
        textoBoton: string;
    } | null;
    estado: import("@prisma/client").$Enums.EstadoConsentimientoDatos;
    /** Fecha límite para responder (informativa en el formulario). */
    plazo: Date | null;
    respondido: boolean;
    fechaRespuesta: Date | null;
    fechaRevocacion: Date | null;
    respuesta: import("./proteccion-datos.types.js").RespuestaConsentimientoDatos | null;
}>;
export declare function revocarConsentimientoPublico(token: string, input?: RevocarConsentimientoPublicoInput, contexto?: ContextoRequestPublico): Promise<{
    nombre: string | null;
    email: string;
    empresaNombre: string | null;
    documento: {
        titulo: string;
        version: string;
        html: string;
        hash: string;
    };
    configuracion: {
        campos: Omit<{
            documentos: {
                titulo: string;
                nombre: string;
                contentType: string;
                size: number;
                sha256: string;
                url: string;
            }[];
            key: string;
            tipo: import("./proteccion-datos.types.js").TipoCampoConsentimiento;
            label: string;
            descripcion?: string;
            obligatorio: boolean;
            placeholder?: string;
            opciones?: import("./proteccion-datos.types.js").OpcionCampoConsentimiento[];
            documentosLeypd?: import("./proteccion-datos.types.js").DocumentoLeypdCampoConsentimiento[];
        }, "documentosLeypd">[];
        schemaVersion: 2;
        tituloFormulario: string;
        descripcionFormulario?: string;
        textoBoton: string;
    } | null;
    estado: import("@prisma/client").$Enums.EstadoConsentimientoDatos;
    /** Fecha límite para responder (informativa en el formulario). */
    plazo: Date | null;
    respondido: boolean;
    fechaRespuesta: Date | null;
    fechaRevocacion: Date | null;
    respuesta: import("./proteccion-datos.types.js").RespuestaConsentimientoDatos | null;
}>;
export {};
//# sourceMappingURL=proteccion-datos-publico.service.d.ts.map