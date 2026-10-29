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
        campos: {
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
        }[];
        schemaVersion: 2;
        tituloFormulario: string;
        descripcionFormulario?: string;
        textoBoton: string;
    } | null;
    estado: import("@prisma/client").$Enums.EstadoConsentimientoDatos;
    respondido: boolean;
    fechaRespuesta: Date | null;
    fechaRevocacion: Date | null;
    respuesta: import("./proteccion-datos.types.js").RespuestaConsentimientoDatos | null;
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
        campos: {
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
        }[];
        schemaVersion: 2;
        tituloFormulario: string;
        descripcionFormulario?: string;
        textoBoton: string;
    } | null;
    estado: import("@prisma/client").$Enums.EstadoConsentimientoDatos;
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
        campos: {
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
        }[];
        schemaVersion: 2;
        tituloFormulario: string;
        descripcionFormulario?: string;
        textoBoton: string;
    } | null;
    estado: import("@prisma/client").$Enums.EstadoConsentimientoDatos;
    respondido: boolean;
    fechaRespuesta: Date | null;
    fechaRevocacion: Date | null;
    respuesta: import("./proteccion-datos.types.js").RespuestaConsentimientoDatos | null;
}>;
export {};
//# sourceMappingURL=proteccion-datos-publico.service.d.ts.map