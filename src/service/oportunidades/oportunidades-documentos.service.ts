// src/service/oportunidades/oportunidades-documentos.service.ts
//
// PDF adjuntos a una oportunidad del funnel. Mismo patrón que los
// contratos de suscripciones: archivo en Supabase Storage (bucket privado)
// y URL firmada de 10 minutos para verlo o descargarlo.

import { randomUUID } from "node:crypto";

import { prisma } from "../../lib/prisma.js";

import {
    supabaseAdmin,
    OPORTUNIDADES_DOCUMENTOS_BUCKET,
} from "../../lib/supabase/supabase.js";

import { OportunidadNoEncontradaError } from "./oportunidades.service.js";

/* =========================================================
   CONFIGURACIÓN
========================================================= */

export const MAX_BYTES_DOCUMENTO = 15 * 1024 * 1024; // 15 MB

const MAX_DOCUMENTOS_POR_OPORTUNIDAD = 30;

const URL_FIRMADA_SEGUNDOS = 60 * 10;

export const TIPOS_DOCUMENTO_OPORTUNIDAD = [
    "PROPUESTA",
    "BASES",
    "ORDEN_COMPRA",
    "CONTRATO",
    "OTRO",
] as const;

export type TipoDocumentoOportunidad =
    (typeof TIPOS_DOCUMENTO_OPORTUNIDAD)[number];

/* =========================================================
   ERRORES
========================================================= */

export class DocumentoOportunidadError extends Error {
    constructor(
        public readonly code: string,
        message: string,
        public readonly status = 400,
    ) {
        super(message);
        this.name = "DocumentoOportunidadError";
    }
}

/* =========================================================
   HELPERS
========================================================= */

const SELECT_DOCUMENTO = {
    id: true,
    oportunidadId: true,
    tipo: true,
    nombre: true,
    descripcion: true,
    mimeType: true,
    bytes: true,
    createdAt: true,
    subidoPor: {
        select: {
            id_tecnico: true,
            nombre: true,
        },
    },
} as const;

async function asegurarOportunidad(oportunidadId: number) {
    const oportunidad = await prisma.oportunidadVenta.findFirst({
        where: { id: oportunidadId, activo: true },
        select: { id: true },
    });

    if (!oportunidad) {
        throw new OportunidadNoEncontradaError();
    }
}

async function obtenerDocumentoDeOportunidad(
    oportunidadId: number,
    documentoId: number,
) {
    const documento = await prisma.oportunidadDocumento.findFirst({
        where: { id: documentoId, oportunidadId },
    });

    if (!documento) {
        throw new DocumentoOportunidadError(
            "DOCUMENTO_NO_ENCONTRADO",
            "Documento no encontrado.",
            404,
        );
    }

    return documento;
}

/** El contenido debe empezar con %PDF (no basta con el mimetype que manda el navegador). */
function esPdf(buffer: Buffer): boolean {
    return buffer.subarray(0, 5).toString("latin1") === "%PDF-";
}

/* =========================================================
   LISTAR
========================================================= */

export async function listarDocumentosOportunidad(oportunidadId: number) {
    const existe = await prisma.oportunidadVenta.findUnique({
        where: { id: oportunidadId },
        select: { id: true },
    });

    if (!existe) {
        throw new OportunidadNoEncontradaError();
    }

    return prisma.oportunidadDocumento.findMany({
        where: { oportunidadId },
        orderBy: { createdAt: "desc" },
        select: SELECT_DOCUMENTO,
    });
}

/* =========================================================
   SUBIR
========================================================= */

export async function subirDocumentoOportunidad(
    oportunidadId: number,
    actorId: number | null,
    archivo: Express.Multer.File,
    datos: {
        tipo: TipoDocumentoOportunidad;
        descripcion: string | null;
    },
) {
    await asegurarOportunidad(oportunidadId);

    if (!esPdf(archivo.buffer)) {
        throw new DocumentoOportunidadError(
            "ARCHIVO_NO_PDF",
            "El archivo no es un PDF válido.",
        );
    }

    const cantidad = await prisma.oportunidadDocumento.count({
        where: { oportunidadId },
    });

    if (cantidad >= MAX_DOCUMENTOS_POR_OPORTUNIDAD) {
        throw new DocumentoOportunidadError(
            "LIMITE_DOCUMENTOS",
            `La oportunidad ya tiene ${MAX_DOCUMENTOS_POR_OPORTUNIDAD} documentos. Elimina alguno antes de subir otro.`,
        );
    }

    /*
     * multer entrega originalname en latin1: lo pasamos a UTF-8 para
     * conservar tildes. Si la conversión no es válida, se deja tal cual.
     */
    const convertido = Buffer.from(archivo.originalname, "latin1").toString("utf8");

    const nombreOriginal =
        (convertido.includes("\uFFFD") ? archivo.originalname : convertido).trim() ||
        "documento.pdf";

    const nombreSeguro = nombreOriginal
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[^a-zA-Z0-9._-]/g, "_")
        .slice(0, 120);

    const storagePath = [
        `oportunidad-${oportunidadId}`,
        `${randomUUID()}-${nombreSeguro}`,
    ].join("/");

    const { error: uploadError } = await supabaseAdmin.storage
        .from(OPORTUNIDADES_DOCUMENTOS_BUCKET)
        .upload(storagePath, archivo.buffer, {
            contentType: "application/pdf",
            upsert: false,
        });

    if (uploadError) {
        console.error("[oportunidades][documentos] Error subiendo a Supabase:", uploadError);

        throw new DocumentoOportunidadError(
            "ERROR_SUBIENDO_DOCUMENTO",
            "No se pudo subir el PDF. Intenta nuevamente.",
            502,
        );
    }

    try {
        return await prisma.oportunidadDocumento.create({
            data: {
                oportunidadId,
                tipo: datos.tipo,
                nombre: nombreOriginal,
                descripcion: datos.descripcion,
                mimeType: "application/pdf",
                bytes: archivo.size,
                storagePath,
                subidoPorId: actorId,
            },
            select: SELECT_DOCUMENTO,
        });
    } catch (error) {
        /* Si la base falla, no dejamos el archivo huérfano en Supabase */
        await supabaseAdmin.storage
            .from(OPORTUNIDADES_DOCUMENTOS_BUCKET)
            .remove([storagePath]);

        throw error;
    }
}

/* =========================================================
   URL FIRMADA
========================================================= */

export async function obtenerUrlDocumentoOportunidad(
    oportunidadId: number,
    documentoId: number,
    descargar: boolean,
) {
    const documento = await obtenerDocumentoDeOportunidad(oportunidadId, documentoId);

    const { data, error } = await supabaseAdmin.storage
        .from(OPORTUNIDADES_DOCUMENTOS_BUCKET)
        .createSignedUrl(
            documento.storagePath,
            URL_FIRMADA_SEGUNDOS,
            descargar ? { download: documento.nombre } : undefined,
        );

    if (error || !data?.signedUrl) {
        console.error("[oportunidades][documentos] Error generando URL firmada:", error);

        throw new DocumentoOportunidadError(
            "ERROR_URL_DOCUMENTO",
            "No se pudo abrir el documento.",
            502,
        );
    }

    return {
        id: documento.id,
        nombre: documento.nombre,
        url: data.signedUrl,
        expiresIn: URL_FIRMADA_SEGUNDOS,
    };
}

/* =========================================================
   ELIMINAR
========================================================= */

export async function eliminarDocumentoOportunidad(
    oportunidadId: number,
    documentoId: number,
) {
    const documento = await obtenerDocumentoDeOportunidad(oportunidadId, documentoId);

    await prisma.oportunidadDocumento.delete({
        where: { id: documento.id },
    });

    /* El registro ya no existe; si Storage falla solo queda un archivo huérfano */
    const { error } = await supabaseAdmin.storage
        .from(OPORTUNIDADES_DOCUMENTOS_BUCKET)
        .remove([documento.storagePath]);

    if (error) {
        console.warn(
            "[oportunidades][documentos] No se pudo eliminar el archivo de Supabase:",
            documento.storagePath,
            error,
        );
    }

    return { id: documento.id };
}