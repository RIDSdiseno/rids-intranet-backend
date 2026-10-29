import { EstadoCampaniaProteccionDatos, Prisma } from "@prisma/client";
import type { ActualizarCampaniaProteccionDatosInput, CrearCampaniaProteccionDatosInput } from "./proteccion-datos.types.js";
/**
 * Sanitización específica para documentos legales.
 *
 * Se permiten etiquetas típicas de documentos:
 * encabezados, párrafos, listas, tablas, enlaces, etc.
 *
 * NO se permiten:
 * - script
 * - iframe
 * - event handlers
 * - javascript:
 */
export declare function sanitizarDocumentoProteccionDatos(html: string): string;
/**
 * Sanitización del cuerpo HTML del correo.
 *
 * Se mantiene separada del documento legal porque
 * sus requerimientos pueden cambiar independientemente.
 */
export declare function sanitizarCorreoProteccionDatos(html: string): string;
export declare function crearCampaniaProteccionDatos(input: CrearCampaniaProteccionDatosInput): Promise<{
    _count: {
        destinatarios: number;
    };
    creadoPor: {
        nombre: string;
        email: string;
        id_tecnico: number;
    } | null;
} & {
    nombre: string;
    createdAt: Date;
    updatedAt: Date;
    id: number;
    estado: import("@prisma/client").$Enums.EstadoCampaniaProteccionDatos;
    descripcion: string | null;
    creadoPorId: number | null;
    fechaInicio: Date | null;
    fechaFin: Date | null;
    versionDocumento: string;
    documentoHash: string;
    tituloDocumento: string;
    contenidoHtml: string;
    configuracionConsentimiento: Prisma.JsonValue | null;
    asuntoCorreo: string;
    cuerpoCorreoHtml: string;
    fechaEnvioInicial: Date | null;
}>;
export declare function listarCampaniasProteccionDatos(params?: {
    estado?: EstadoCampaniaProteccionDatos;
    search?: string;
    skip?: number;
    take?: number;
}): Promise<{
    items: ({
        _count: {
            destinatarios: number;
        };
        creadoPor: {
            nombre: string;
            email: string;
            id_tecnico: number;
        } | null;
    } & {
        nombre: string;
        createdAt: Date;
        updatedAt: Date;
        id: number;
        estado: import("@prisma/client").$Enums.EstadoCampaniaProteccionDatos;
        descripcion: string | null;
        creadoPorId: number | null;
        fechaInicio: Date | null;
        fechaFin: Date | null;
        versionDocumento: string;
        documentoHash: string;
        tituloDocumento: string;
        contenidoHtml: string;
        configuracionConsentimiento: Prisma.JsonValue | null;
        asuntoCorreo: string;
        cuerpoCorreoHtml: string;
        fechaEnvioInicial: Date | null;
    })[];
    total: number;
    skip: number;
    take: number;
}>;
export declare function obtenerCampaniaProteccionDatos(id: number): Promise<{
    _count: {
        destinatarios: number;
    };
    creadoPor: {
        nombre: string;
        email: string;
        id_tecnico: number;
    } | null;
} & {
    nombre: string;
    createdAt: Date;
    updatedAt: Date;
    id: number;
    estado: import("@prisma/client").$Enums.EstadoCampaniaProteccionDatos;
    descripcion: string | null;
    creadoPorId: number | null;
    fechaInicio: Date | null;
    fechaFin: Date | null;
    versionDocumento: string;
    documentoHash: string;
    tituloDocumento: string;
    contenidoHtml: string;
    configuracionConsentimiento: Prisma.JsonValue | null;
    asuntoCorreo: string;
    cuerpoCorreoHtml: string;
    fechaEnvioInicial: Date | null;
}>;
export declare function actualizarCampaniaProteccionDatos(id: number, input: ActualizarCampaniaProteccionDatosInput): Promise<{
    _count: {
        destinatarios: number;
    };
    creadoPor: {
        nombre: string;
        email: string;
        id_tecnico: number;
    } | null;
} & {
    nombre: string;
    createdAt: Date;
    updatedAt: Date;
    id: number;
    estado: import("@prisma/client").$Enums.EstadoCampaniaProteccionDatos;
    descripcion: string | null;
    creadoPorId: number | null;
    fechaInicio: Date | null;
    fechaFin: Date | null;
    versionDocumento: string;
    documentoHash: string;
    tituloDocumento: string;
    contenidoHtml: string;
    configuracionConsentimiento: Prisma.JsonValue | null;
    asuntoCorreo: string;
    cuerpoCorreoHtml: string;
    fechaEnvioInicial: Date | null;
}>;
export declare function activarCampaniaProteccionDatos(id: number): Promise<{
    _count: {
        destinatarios: number;
    };
    creadoPor: {
        nombre: string;
        email: string;
        id_tecnico: number;
    } | null;
} & {
    nombre: string;
    createdAt: Date;
    updatedAt: Date;
    id: number;
    estado: import("@prisma/client").$Enums.EstadoCampaniaProteccionDatos;
    descripcion: string | null;
    creadoPorId: number | null;
    fechaInicio: Date | null;
    fechaFin: Date | null;
    versionDocumento: string;
    documentoHash: string;
    tituloDocumento: string;
    contenidoHtml: string;
    configuracionConsentimiento: Prisma.JsonValue | null;
    asuntoCorreo: string;
    cuerpoCorreoHtml: string;
    fechaEnvioInicial: Date | null;
}>;
export declare function finalizarCampaniaProteccionDatos(id: number): Promise<{
    _count: {
        destinatarios: number;
    };
    creadoPor: {
        nombre: string;
        email: string;
        id_tecnico: number;
    } | null;
} & {
    nombre: string;
    createdAt: Date;
    updatedAt: Date;
    id: number;
    estado: import("@prisma/client").$Enums.EstadoCampaniaProteccionDatos;
    descripcion: string | null;
    creadoPorId: number | null;
    fechaInicio: Date | null;
    fechaFin: Date | null;
    versionDocumento: string;
    documentoHash: string;
    tituloDocumento: string;
    contenidoHtml: string;
    configuracionConsentimiento: Prisma.JsonValue | null;
    asuntoCorreo: string;
    cuerpoCorreoHtml: string;
    fechaEnvioInicial: Date | null;
}>;
export declare function cancelarCampaniaProteccionDatos(id: number): Promise<{
    _count: {
        destinatarios: number;
    };
    creadoPor: {
        nombre: string;
        email: string;
        id_tecnico: number;
    } | null;
} & {
    nombre: string;
    createdAt: Date;
    updatedAt: Date;
    id: number;
    estado: import("@prisma/client").$Enums.EstadoCampaniaProteccionDatos;
    descripcion: string | null;
    creadoPorId: number | null;
    fechaInicio: Date | null;
    fechaFin: Date | null;
    versionDocumento: string;
    documentoHash: string;
    tituloDocumento: string;
    contenidoHtml: string;
    configuracionConsentimiento: Prisma.JsonValue | null;
    asuntoCorreo: string;
    cuerpoCorreoHtml: string;
    fechaEnvioInicial: Date | null;
}>;
//# sourceMappingURL=proteccion-datos.service.d.ts.map