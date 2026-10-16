// src/service/correos-masivos/correos-masivos-template.service.ts
import sanitizeHtml from "sanitize-html";
import juice from "juice";
import { prisma, } from "../../lib/prisma.js";
import { subirArchivoPlantilla, descargarArchivoPlantilla, crearUrlPreviewPlantilla, eliminarArchivoPlantilla, } from "./correos-masivos-storage.service.js";
const MIME_IMAGES = new Set([
    "image/png",
    "image/jpeg",
    "image/webp",
    "image/gif",
]);
// =====================================================
// HTML
// =====================================================
function sanitizeImportedHtml(html) {
    const safe = sanitizeHtml(html, {
        allowedTags: sanitizeHtml
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
        allowProtocolRelative: false,
        disallowedTagsMode: "discard",
    });
    return juice(safe);
}
// =====================================================
// GENERAR HTML PARA IMAGEN
// =====================================================
function generarHtmlImagen(contentId) {
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
export async function crearPlantillaCorreo({ nombre, descripcion, uso = "CONTENIDO", nombreArchivo, mimeType, buffer, creadoPorId, }) {
    const usoNormalizado = uso === "FIRMA"
        ? "FIRMA"
        : "CONTENIDO";
    if (usoNormalizado === "FIRMA" &&
        !MIME_IMAGES.has(mimeType)) {
        throw new Error("Las firmas deben ser archivos de imagen");
    }
    const extension = nombreArchivo
        .toLowerCase()
        .split(".")
        .pop();
    if (mimeType === "text/html" ||
        extension === "html" ||
        extension === "htm") {
        if (usoNormalizado ===
            "FIRMA") {
            throw new Error("Las firmas no pueden ser archivos HTML");
        }
        return crearPlantillaHtml({
            nombre,
            nombreArchivo,
            buffer,
            uso: usoNormalizado,
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
    if (MIME_IMAGES.has(mimeType)) {
        return crearPlantillaImagen({
            nombre,
            nombreArchivo,
            mimeType,
            buffer,
            uso: usoNormalizado,
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
    throw new Error("Formato no soportado. Usa HTML, PNG, JPG, JPEG, WEBP o GIF.");
}
// =====================================================
// CREAR HTML
// =====================================================
async function crearPlantillaHtml({ nombre, descripcion, uso, nombreArchivo, buffer, creadoPorId, }) {
    const rawHtml = buffer.toString("utf8");
    if (!rawHtml.trim()) {
        throw new Error("El archivo HTML está vacío");
    }
    const htmlProcesado = sanitizeImportedHtml(rawHtml);
    const plantilla = await prisma
        .plantillaCorreo
        .create({
        data: {
            nombre,
            descripcion: descripcion ??
                null,
            tipo: "HTML",
            uso,
            nombreArchivo,
            mimeType: "text/html",
            bytes: buffer.length,
            htmlProcesado,
            creadoPorId: creadoPorId ??
                null,
        },
    });
    try {
        const storagePath = await subirArchivoPlantilla({
            plantillaId: plantilla.id,
            nombre: nombreArchivo,
            buffer,
            contentType: "text/html",
        });
        return await prisma
            .plantillaCorreo
            .update({
            where: {
                id: plantilla.id,
            },
            data: {
                storagePath,
            },
        });
    }
    catch (error) {
        await prisma
            .plantillaCorreo
            .delete({
            where: {
                id: plantilla.id,
            },
        })
            .catch(() => undefined);
        throw error;
    }
}
// =====================================================
// CREAR IMAGEN
// =====================================================
async function crearPlantillaImagen({ nombre, descripcion, uso, nombreArchivo, mimeType, buffer, creadoPorId, }) {
    if (!MIME_IMAGES.has(mimeType)) {
        throw new Error("Formato de imagen no soportado");
    }
    const plantilla = await prisma
        .plantillaCorreo
        .create({
        data: {
            nombre,
            descripcion: descripcion ??
                null,
            tipo: "IMAGEN",
            uso,
            nombreArchivo,
            mimeType,
            bytes: buffer.length,
            creadoPorId: creadoPorId ??
                null,
        },
    });
    try {
        const contentId = `plantilla-${plantilla.id}-main`;
        const storagePath = await subirArchivoPlantilla({
            plantillaId: plantilla.id,
            nombre: nombreArchivo,
            buffer,
            contentType: mimeType,
        });
        const htmlProcesado = generarHtmlImagen(contentId);
        return await prisma
            .plantillaCorreo
            .update({
            where: {
                id: plantilla.id,
            },
            data: {
                storagePath,
                htmlProcesado,
            },
        });
    }
    catch (error) {
        await prisma
            .plantillaCorreo
            .delete({
            where: {
                id: plantilla.id,
            },
        })
            .catch(() => undefined);
        throw error;
    }
}
// =====================================================
// LISTAR
// =====================================================
export async function listarPlantillasCorreo(uso) {
    const plantillas = await prisma
        .plantillaCorreo
        .findMany({
        where: {
            activo: true,
            ...(uso
                ? {
                    uso,
                }
                : {}),
        },
        orderBy: {
            createdAt: "desc",
        },
        select: {
            id: true,
            nombre: true,
            descripcion: true,
            tipo: true,
            uso: true,
            nombreArchivo: true,
            mimeType: true,
            bytes: true,
            storagePath: true,
            createdAt: true,
            updatedAt: true,
        },
    });
    return Promise.all(plantillas.map(async (plantilla) => {
        let previewUrl = null;
        if (plantilla.tipo ===
            "IMAGEN" &&
            plantilla.storagePath) {
            try {
                previewUrl =
                    await crearUrlPreviewPlantilla(plantilla.storagePath);
            }
            catch {
                previewUrl =
                    null;
            }
        }
        return {
            ...plantilla,
            previewUrl,
        };
    }));
}
// =====================================================
// OBTENER
// =====================================================
export async function obtenerPlantillaCorreo(id) {
    const plantilla = await prisma
        .plantillaCorreo
        .findUnique({
        where: {
            id,
        },
    });
    if (!plantilla) {
        throw new Error("Plantilla no encontrada");
    }
    let previewUrl = null;
    if (plantilla.tipo ===
        "IMAGEN" &&
        plantilla.storagePath) {
        try {
            previewUrl =
                await crearUrlPreviewPlantilla(plantilla.storagePath);
        }
        catch {
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
export async function prepararPlantillaParaEnvio(id) {
    const plantilla = await prisma
        .plantillaCorreo
        .findUnique({
        where: {
            id,
        },
    });
    if (!plantilla) {
        throw new Error("Plantilla no encontrada");
    }
    if (!plantilla.activo) {
        throw new Error("La plantilla está desactivada");
    }
    if (plantilla.uso !==
        "CONTENIDO") {
        throw new Error("La plantilla seleccionada no corresponde a contenido principal");
    }
    if (!plantilla.htmlProcesado) {
        throw new Error("La plantilla no posee HTML procesado");
    }
    if (plantilla.tipo ===
        "HTML") {
        return {
            bodyHtml: plantilla.htmlProcesado,
            attachments: [],
        };
    }
    if (plantilla.tipo ===
        "IMAGEN") {
        if (!plantilla.storagePath ||
            !plantilla.mimeType ||
            !plantilla.nombreArchivo) {
            throw new Error("La plantilla de imagen está incompleta");
        }
        const buffer = await descargarArchivoPlantilla(plantilla.storagePath);
        return {
            bodyHtml: plantilla.htmlProcesado,
            attachments: [
                {
                    name: plantilla.nombreArchivo,
                    contentType: plantilla.mimeType,
                    contentBytes: buffer.toString("base64"),
                    size: buffer.length,
                    isInline: true,
                    contentId: `plantilla-${plantilla.id}-main`,
                },
            ],
        };
    }
    throw new Error("Tipo de plantilla no soportado");
}
export async function prepararFirmaParaEnvio(id) {
    const plantilla = await prisma
        .plantillaCorreo
        .findUnique({
        where: {
            id,
        },
    });
    if (!plantilla) {
        throw new Error("Firma no encontrada");
    }
    if (!plantilla.activo) {
        throw new Error("La firma está desactivada");
    }
    if (plantilla.uso !==
        "FIRMA") {
        throw new Error("La plantilla seleccionada no corresponde a una firma");
    }
    if (plantilla.tipo !==
        "IMAGEN") {
        throw new Error("La firma debe ser una imagen");
    }
    if (!plantilla.storagePath ||
        !plantilla.mimeType ||
        !plantilla.nombreArchivo) {
        throw new Error("La firma está incompleta");
    }
    const buffer = await descargarArchivoPlantilla(plantilla.storagePath);
    const contentId = `firma-${plantilla.id}-main`;
    const bodyHtml = `
<table
    width="100%"
    cellpadding="0"
    cellspacing="0"
    border="0"
    role="presentation"
    style="margin-top:24px;"
>
    <tr>
        <td
            align="left"
            style="
                padding-top:16px;
                border-top:1px solid #e5e7eb;
            "
        >
            <img
                src="cid:${contentId}"
                alt="${plantilla.nombre}"
                style="
                    display:block;
                    max-width:420px;
                    width:auto;
                    height:auto;
                    border:0;
                    outline:none;
                    text-decoration:none;
                "
            />
        </td>
    </tr>
</table>
`.trim();
    return {
        bodyHtml,
        attachments: [
            {
                name: plantilla.nombreArchivo,
                contentType: plantilla.mimeType,
                contentBytes: buffer.toString("base64"),
                size: buffer.length,
                isInline: true,
                contentId,
            },
        ],
    };
}
// =====================================================
// ELIMINAR
// =====================================================
export async function eliminarPlantillaCorreo(id) {
    const plantilla = await prisma
        .plantillaCorreo
        .findUnique({
        where: {
            id,
        },
    });
    if (!plantilla) {
        throw new Error("Plantilla no encontrada");
    }
    if (plantilla.storagePath) {
        await eliminarArchivoPlantilla(plantilla.storagePath);
    }
    await prisma
        .plantillaCorreo
        .delete({
        where: {
            id,
        },
    });
    return {
        ok: true,
    };
}
export async function actualizarPlantillaCorreo(id, data) {
    const actual = await prisma
        .plantillaCorreo
        .findUnique({
        where: {
            id,
        },
    });
    if (!actual) {
        throw new Error("Plantilla no encontrada");
    }
    if (data.uso ===
        "FIRMA" &&
        actual.tipo !==
            "IMAGEN") {
        throw new Error("Solo las plantillas de imagen pueden utilizarse como firma");
    }
    return prisma
        .plantillaCorreo
        .update({
        where: {
            id,
        },
        data: {
            ...(data.nombre !== undefined
                ? {
                    nombre: data.nombre.trim(),
                }
                : {}),
            ...(data.descripcion !== undefined
                ? {
                    descripcion: data.descripcion,
                }
                : {}),
            ...(data.uso !== undefined
                ? {
                    uso: data.uso,
                }
                : {}),
            ...(data.activo !== undefined
                ? {
                    activo: data.activo,
                }
                : {}),
        },
    });
}
//# sourceMappingURL=correos-masivos-template.service.js.map