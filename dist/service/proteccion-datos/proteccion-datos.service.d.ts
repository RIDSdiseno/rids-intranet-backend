import { EstadoCampaniaProteccionDatos, Prisma } from "@prisma/client";
import type { ActualizarCampaniaProteccionDatosInput, CrearCampaniaProteccionDatosInput, OrigenCampaniaProteccionDatos } from "./proteccion-datos.types.js";
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
    empresaId: number | null;
    createdAt: Date;
    updatedAt: Date;
    origen: string;
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
    leypdElementoNumero: number | null;
}>;
export declare function listarCampaniasProteccionDatos(params?: {
    estado?: EstadoCampaniaProteccionDatos;
    search?: string;
    skip?: number;
    take?: number;
    empresaId?: number;
    origen?: OrigenCampaniaProteccionDatos;
    leypdElementoNumero?: number;
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
        empresaId: number | null;
        createdAt: Date;
        updatedAt: Date;
        origen: string;
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
        leypdElementoNumero: number | null;
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
    empresaId: number | null;
    createdAt: Date;
    updatedAt: Date;
    origen: string;
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
    leypdElementoNumero: number | null;
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
    empresaId: number | null;
    createdAt: Date;
    updatedAt: Date;
    origen: string;
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
    leypdElementoNumero: number | null;
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
    empresaId: number | null;
    createdAt: Date;
    updatedAt: Date;
    origen: string;
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
    leypdElementoNumero: number | null;
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
    empresaId: number | null;
    createdAt: Date;
    updatedAt: Date;
    origen: string;
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
    leypdElementoNumero: number | null;
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
    empresaId: number | null;
    createdAt: Date;
    updatedAt: Date;
    origen: string;
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
    leypdElementoNumero: number | null;
}>;
export type ResumenCampaniaEmpresa = {
    id: number;
    nombre: string;
    tituloDocumento: string;
    versionDocumento: string;
    estado: EstadoCampaniaProteccionDatos;
    fechaEnvioInicial: Date | null;
    fechaFin: Date | null;
    createdAt: Date;
    /** Destinatarios de ESTA empresa en la campaña. */
    destinatarios: number;
    enviados: number;
    aceptados: number;
    rechazados: number;
    revocados: number;
    /** Sin respuesta todavía (pendientes de envío o enviados sin responder). */
    pendientes: number;
    errores: number;
    ultimoEnvio: Date | null;
};
export type ResumenEmpresaProteccionDatos = {
    empresaId: number | null;
    empresaNombre: string;
    campanias: number;
    campaniasEnviadas: number;
    destinatarios: number;
    enviados: number;
    aceptados: number;
    rechazados: number;
    revocados: number;
    pendientes: number;
    errores: number;
    ultimoEnvio: Date | null;
    campaniasDetalle: ResumenCampaniaEmpresa[];
};
export declare function resumenEmpresasProteccionDatos(params?: {
    estado?: EstadoCampaniaProteccionDatos;
}): Promise<ResumenEmpresaProteccionDatos[]>;
//# sourceMappingURL=proteccion-datos.service.d.ts.map