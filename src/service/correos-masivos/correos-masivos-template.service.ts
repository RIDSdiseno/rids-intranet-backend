// src/service/correos-masivos/correos-masivos-template.service.ts
import sanitizeHtml from "sanitize-html";
import juice from "juice";

import {
    prisma,
} from "../../lib/prisma.js";

import {
    subirArchivoPlantilla,
    descargarArchivoPlantilla,
    crearUrlPreviewPlantilla,
    eliminarArchivoPlantilla,
} from "./correos-masivos-storage.service.js";

const MIME_IMAGES =
    new Set([
        "image/png",
        "image/jpeg",
        "image/webp",
    ]);

export type PlantillaAttachmentPreparado = {
    name: string;

    contentType: string;

    contentBytes: string;

    size?: number;

    isInline?: boolean;

    contentId?: string;
};

export type PlantillaPreparadaEnvio = {
    bodyHtml: string;

    attachments:
    PlantillaAttachmentPreparado[];
};


// =====================================================
// HTML
// =====================================================

function sanitizeImportedHtml(
    html: string
): string {

    const safe =
        sanitizeHtml(
            html,
            {
                allowedTags:
                    sanitizeHtml
                        .defaults
                        .allowedTags
                        .concat([
                            "html",
                            "head",
                            "body",
                            "table",
                            "thead",
                            "tbody",
                            "tfoot",
                            "tr",
                            "td",
                            "th",
                            "img",
                            "style",
                            "span",
                            "div",
                            "center",
                        ]),

                allowedAttributes: {
                    "*": [
                        "style",
                        "class",
                        "id",
                        "align",
                        "valign",
                        "width",
                        "height",
                        "title",
                    ],

                    a: [
                        "href",
                        "target",
                        "style",
                        "title",
                    ],

                    img: [
                        "src",
                        "alt",
                        "width",
                        "height",
                        "style",
                    ],

                    table: [
                        "width",
                        "height",
                        "cellpadding",
                        "cellspacing",
                        "border",
                        "style",
                        "align",
                    ],

                    td: [
                        "width",
                        "height",
                        "align",
                        "valign",
                        "colspan",
                        "rowspan",
                        "style",
                    ],

                    th: [
                        "width",
                        "height",
                        "align",
                        "valign",
                        "colspan",
                        "rowspan",
                        "style",
                    ],
                },

                allowedSchemes: [
                    "http",
                    "https",
                    "mailto",
                    "cid",
                ],

                allowProtocolRelative:
                    false,

                disallowedTagsMode:
                    "discard",
            }
        );

    return juice(
        safe
    );
}


// =====================================================
// GENERAR HTML PARA IMAGEN
// =====================================================

function generarHtmlImagen(
    contentId: string
): string {

    return `
<!DOCTYPE html>
<html lang="es">
<body style="margin:0;padding:0;background-color:#ffffff;">
<table
    width="100%"
    cellpadding="0"
    cellspacing="0"
    border="0"
    role="presentation"
>
    <tr>
        <td
            align="center"
            style="margin:0;padding:0;"
        >
            <img
                src="cid:${contentId}"
                width="600"
                alt=""
                style="
                    display:block;
                    width:100%;
                    max-width:600px;
                    height:auto;
                    border:0;
                    outline:none;
                    text-decoration:none;
                "
            />
        </td>
    </tr>
</table>
</body>
</html>
`.trim();
}


// =====================================================
// CREAR PLANTILLA
// =====================================================

export async function crearPlantillaCorreo({
    nombre,
    descripcion,
    nombreArchivo,
    mimeType,
    buffer,
    creadoPorId,
}: {
    nombre: string;
    descripcion?: string | null;
    nombreArchivo: string;
    mimeType: string;
    buffer: Buffer;
    creadoPorId?: number | null;
}) {

    const extension =
        nombreArchivo
            .toLowerCase()
            .split(".")
            .pop();

    if (
        mimeType === "text/html" ||
        extension === "html" ||
        extension === "htm"
    ) {
        return crearPlantillaHtml({
            nombre,

            nombreArchivo,

            buffer,

            ...(descripcion !== undefined
                ? {
                    descripcion,
                }
                : {}),

            ...(creadoPorId !== undefined
                ? {
                    creadoPorId,
                }
                : {}),
        });
    }

    if (
        MIME_IMAGES.has(
            mimeType
        )
    ) {
        return crearPlantillaImagen({
            nombre,

            nombreArchivo,

            mimeType,

            buffer,

            ...(descripcion !== undefined
                ? {
                    descripcion,
                }
                : {}),

            ...(creadoPorId !== undefined
                ? {
                    creadoPorId,
                }
                : {}),
        });
    }

    throw new Error(
        "Formato no soportado. Usa HTML, PNG, JPG o WEBP."
    );
}


// =====================================================
// CREAR HTML
// =====================================================

async function crearPlantillaHtml({
    nombre,
    descripcion,
    nombreArchivo,
    buffer,
    creadoPorId,
}: {
    nombre: string;
    descripcion?: string | null;
    nombreArchivo: string;
    buffer: Buffer;
    creadoPorId?: number | null;
}) {

    const rawHtml =
        buffer.toString(
            "utf8"
        );

    if (
        !rawHtml.trim()
    ) {
        throw new Error(
            "El archivo HTML está vacío"
        );
    }

    const htmlProcesado =
        sanitizeImportedHtml(
            rawHtml
        );

    const plantilla =
        await prisma
            .plantillaCorreo
            .create({
                data: {
                    nombre,

                    descripcion:
                        descripcion ?? null,

                    tipo:
                        "HTML",

                    nombreArchivo,

                    mimeType:
                        "text/html",

                    bytes:
                        buffer.length,

                    htmlProcesado,

                    creadoPorId:
                        creadoPorId ?? null,
                },
            });

    try {

        const storagePath =
            await subirArchivoPlantilla({
                plantillaId:
                    plantilla.id,

                nombre:
                    nombreArchivo,

                buffer,

                contentType:
                    "text/html",
            });

        return await prisma
            .plantillaCorreo
            .update({
                where: {
                    id:
                        plantilla.id,
                },

                data: {
                    storagePath,
                },
            });

    } catch (error) {

        await prisma
            .plantillaCorreo
            .delete({
                where: {
                    id:
                        plantilla.id,
                },
            })
            .catch(
                () => undefined
            );

        throw error;
    }
}


// =====================================================
// CREAR IMAGEN
// =====================================================

async function crearPlantillaImagen({
    nombre,
    descripcion,
    nombreArchivo,
    mimeType,
    buffer,
    creadoPorId,
}: {
    nombre: string;
    descripcion?: string | null;
    nombreArchivo: string;
    mimeType: string;
    buffer: Buffer;
    creadoPorId?: number | null;
}) {

    if (
        !MIME_IMAGES.has(
            mimeType
        )
    ) {
        throw new Error(
            "Formato de imagen no soportado"
        );
    }

    const plantilla =
        await prisma
            .plantillaCorreo
            .create({
                data: {
                    nombre,

                    descripcion:
                        descripcion ?? null,

                    tipo:
                        "IMAGEN",

                    nombreArchivo,

                    mimeType,

                    bytes:
                        buffer.length,

                    creadoPorId:
                        creadoPorId ?? null,
                },
            });

    try {

        const contentId =
            `plantilla-${plantilla.id}-main`;

        const storagePath =
            await subirArchivoPlantilla({
                plantillaId:
                    plantilla.id,

                nombre:
                    nombreArchivo,

                buffer,

                contentType:
                    mimeType,
            });

        const htmlProcesado =
            generarHtmlImagen(
                contentId
            );

        return await prisma
            .plantillaCorreo
            .update({
                where: {
                    id:
                        plantilla.id,
                },

                data: {
                    storagePath,
                    htmlProcesado,
                },
            });

    } catch (error) {

        await prisma
            .plantillaCorreo
            .delete({
                where: {
                    id:
                        plantilla.id,
                },
            })
            .catch(
                () => undefined
            );

        throw error;
    }
}


// =====================================================
// LISTAR
// =====================================================

export async function listarPlantillasCorreo() {

    const plantillas =
        await prisma
            .plantillaCorreo
            .findMany({
                where: {
                    activo:
                        true,
                },

                orderBy: {
                    createdAt:
                        "desc",
                },

                select: {
                    id:
                        true,

                    nombre:
                        true,

                    descripcion:
                        true,

                    tipo:
                        true,

                    nombreArchivo:
                        true,

                    mimeType:
                        true,

                    bytes:
                        true,

                    storagePath:
                        true,

                    createdAt:
                        true,

                    updatedAt:
                        true,
                },
            });

    return Promise.all(
        plantillas.map(
            async (
                plantilla
            ) => {

                let previewUrl:
                    string | null =
                    null;

                if (
                    plantilla.tipo ===
                    "IMAGEN" &&
                    plantilla.storagePath
                ) {

                    try {

                        previewUrl =
                            await crearUrlPreviewPlantilla(
                                plantilla.storagePath
                            );

                    } catch {

                        previewUrl =
                            null;
                    }
                }

                return {
                    ...plantilla,

                    previewUrl,
                };
            }
        )
    );
}


// =====================================================
// OBTENER
// =====================================================

export async function obtenerPlantillaCorreo(
    id: number
) {

    const plantilla =
        await prisma
            .plantillaCorreo
            .findUnique({
                where: {
                    id,
                },
            });

    if (!plantilla) {
        throw new Error(
            "Plantilla no encontrada"
        );
    }

    let previewUrl:
        string | null =
        null;

    if (
        plantilla.tipo ===
        "IMAGEN" &&
        plantilla.storagePath
    ) {

        try {

            previewUrl =
                await crearUrlPreviewPlantilla(
                    plantilla.storagePath
                );

        } catch {

            previewUrl =
                null;
        }
    }

    return {
        ...plantilla,

        previewUrl,
    };
}


// =====================================================
// PREPARAR PARA ENVÍO
// =====================================================

export async function prepararPlantillaParaEnvio(
    id: number
): Promise<PlantillaPreparadaEnvio> {

    const plantilla =
        await prisma
            .plantillaCorreo
            .findUnique({
                where: {
                    id,
                },
            });

    if (!plantilla) {
        throw new Error(
            "Plantilla no encontrada"
        );
    }

    if (
        !plantilla.activo
    ) {
        throw new Error(
            "La plantilla está desactivada"
        );
    }

    if (
        !plantilla.htmlProcesado
    ) {
        throw new Error(
            "La plantilla no posee HTML procesado"
        );
    }

    if (
        plantilla.tipo ===
        "HTML"
    ) {
        return {
            bodyHtml:
                plantilla.htmlProcesado,

            attachments:
                [],
        };
    }

    if (
        plantilla.tipo ===
        "IMAGEN"
    ) {

        if (
            !plantilla.storagePath ||
            !plantilla.mimeType ||
            !plantilla.nombreArchivo
        ) {
            throw new Error(
                "La plantilla de imagen está incompleta"
            );
        }

        const buffer =
            await descargarArchivoPlantilla(
                plantilla.storagePath
            );

        return {
            bodyHtml:
                plantilla.htmlProcesado,

            attachments: [
                {
                    name:
                        plantilla.nombreArchivo,

                    contentType:
                        plantilla.mimeType,

                    contentBytes:
                        buffer.toString(
                            "base64"
                        ),

                    size:
                        buffer.length,

                    isInline:
                        true,

                    contentId:
                        `plantilla-${plantilla.id}-main`,
                },
            ],
        };
    }

    throw new Error(
        "Tipo de plantilla no soportado"
    );
}


// =====================================================
// ELIMINAR
// =====================================================

export async function eliminarPlantillaCorreo(
    id: number
) {

    const plantilla =
        await prisma
            .plantillaCorreo
            .findUnique({
                where: {
                    id,
                },
            });

    if (!plantilla) {
        throw new Error(
            "Plantilla no encontrada"
        );
    }

    if (
        plantilla.storagePath
    ) {
        await eliminarArchivoPlantilla(
            plantilla.storagePath
        );
    }

    await prisma
        .plantillaCorreo
        .delete({
            where: {
                id,
            },
        });

    return {
        ok:
            true,
    };
}

export async function actualizarPlantillaCorreo(
    id: number,
    data: {
        nombre?: string;
        descripcion?: string | null;
        activo?: boolean;
    }
) {

    const actual =
        await prisma.plantillaCorreo.findUnique({
            where: {
                id,
            },
        });

    if (!actual) {
        throw new Error(
            "Plantilla no encontrada"
        );
    }

    return prisma.plantillaCorreo.update({
        where: {
            id,
        },

        data: {
            ...(data.nombre !== undefined
                ? {
                    nombre:
                        data.nombre.trim(),
                }
                : {}),

            ...(data.descripcion !== undefined
                ? {
                    descripcion:
                        data.descripcion,
                }
                : {}),

            ...(data.activo !== undefined
                ? {
                    activo:
                        data.activo,
                }
                : {}),
        },
    });
}