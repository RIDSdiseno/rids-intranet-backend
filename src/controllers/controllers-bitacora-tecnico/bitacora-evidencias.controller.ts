// src/controllers/bitacora-tecnico/bitacora-evidencias.controller.ts

import type {
    Request,
    Response,
} from "express";

import {
    EtapaBitacora,
    TipoEvidenciaBitacora,
    TipoEventoBitacora,
} from "@prisma/client";

import {
    randomUUID,
} from "crypto";

import {
    prismaBase as prisma,
} from "../../lib/prisma.js";

import {
    agregarUrlsFirmadasAEvidencias,
    eliminarEvidenciaBitacoraStorage,
    obtenerUrlFirmadaEvidenciaBitacora,
    subirEvidenciaBitacoraStorage,
} from "../../service/bitacora/bitacora-evidencias-storage.service.js";

/* =====================================================
   CONSTANTES
===================================================== */

const MAX_IMAGE_BYTES =
    15 * 1024 * 1024;

const MAX_VIDEO_BYTES =
    150 * 1024 * 1024;

const IMAGE_MIME_TYPES = new Set([
    "image/jpeg",
    "image/png",
    "image/webp",
]);

const VIDEO_MIME_TYPES = new Set([
    "video/mp4",
    "video/webm",
    "video/quicktime",
]);

const ETAPAS_VALIDAS = new Set(
    Object.values(
        EtapaBitacora
    )
);

/* =====================================================
   HELPERS
===================================================== */

function parsePositiveInt(
    value: unknown
): number | undefined {
    const n =
        Number(value);

    return Number.isInteger(n) &&
        n > 0
        ? n
        : undefined;
}

/**
 * Obtiene el ID del usuario autenticado.
 *
 * Se contemplan varios nombres por compatibilidad
 * con distintas versiones del middleware auth.
 *
 * Cuando confirmemos exactamente cómo queda req.user
 * en auth.middleware.ts, este helper se puede simplificar.
 */
function obtenerUsuarioAutenticadoId(
    req: Request
): number | undefined {
    const usuario =
        (req as Request & {
            user?: {
                id?: number;
                id_tecnico?: number;
                tecnicoId?: number;
                userId?: number;
            };
        }).user;

    if (!usuario) {
        return undefined;
    }

    return (
        parsePositiveInt(
            usuario.id_tecnico
        ) ??
        parsePositiveInt(
            usuario.tecnicoId
        ) ??
        parsePositiveInt(
            usuario.id
        ) ??
        parsePositiveInt(
            usuario.userId
        )
    );
}

function normalizarDescripcion(
    value: unknown
): string | null {
    if (
        typeof value !== "string"
    ) {
        return null;
    }

    const descripcion =
        value
            .trim()
            .replace(/\s+/g, " ");

    return descripcion ||
        null;
}

function obtenerEtapa(
    value: unknown
):
    | EtapaBitacora
    | null {
    if (
        typeof value !== "string"
    ) {
        return null;
    }

    const etapa =
        value
            .trim()
            .toUpperCase();

    if (
        !ETAPAS_VALIDAS.has(
            etapa as EtapaBitacora
        )
    ) {
        return null;
    }

    return etapa as
        EtapaBitacora;
}

function obtenerTipoDesdeMime(
    mimeType: string
):
    | TipoEvidenciaBitacora
    | null {
    if (
        IMAGE_MIME_TYPES.has(
            mimeType
        )
    ) {
        return TipoEvidenciaBitacora.IMAGEN;
    }

    if (
        VIDEO_MIME_TYPES.has(
            mimeType
        )
    ) {
        return TipoEvidenciaBitacora.VIDEO;
    }

    return null;
}

function validarTamanoArchivo(
    file: Express.Multer.File,
    tipo: TipoEvidenciaBitacora
):
    | string
    | null {
    if (
        file.size <= 0
    ) {
        return "El archivo está vacío";
    }

    if (
        tipo ===
        TipoEvidenciaBitacora.IMAGEN &&
        file.size >
        MAX_IMAGE_BYTES
    ) {
        return "Las imágenes no pueden superar los 15 MB";
    }

    if (
        tipo ===
        TipoEvidenciaBitacora.VIDEO &&
        file.size >
        MAX_VIDEO_BYTES
    ) {
        return "Los videos no pueden superar los 150 MB";
    }

    return null;
}

/* =====================================================
   GET /:id/evidencias
===================================================== */

export async function obtenerEvidenciasBitacora(
    req: Request,
    res: Response
) {
    try {
        const bitacoraId =
            parsePositiveInt(
                req.params.id
            );

        if (!bitacoraId) {
            return res.status(400).json({
                error:
                    "ID de bitácora inválido",
            });
        }

        /*
         * Se verifica primero que la bitácora exista.
         */
        const bitacora =
            await prisma.bitacoraTecnico.findUnique({
                where: {
                    id:
                        bitacoraId,
                },

                select: {
                    id: true,
                },
            });

        if (!bitacora) {
            return res.status(404).json({
                error:
                    "Bitácora no encontrada",
            });
        }

        const evidencias =
            await prisma.bitacoraEvidencia.findMany({
                where: {
                    bitacoraId,
                },

                orderBy: [
                    {
                        etapa:
                            "asc",
                    },
                    {
                        createdAt:
                            "asc",
                    },
                ],

                include: {
                    subidoPor: {
                        select: {
                            id_tecnico:
                                true,

                            nombre:
                                true,

                            email:
                                true,

                            rol:
                                true,
                        },
                    },
                },
            });

        /*
         * El bucket es privado.
         *
         * Por eso las URLs se generan al momento
         * de consultar y no se persisten.
         */
        const evidenciasConUrl =
            await agregarUrlsFirmadasAEvidencias(
                evidencias
            );

        return res.json({
            data:
                evidenciasConUrl,
        });
    } catch (error) {
        console.error(
            "❌ Error obteniendo evidencias de bitácora:",
            error
        );

        return res.status(500).json({
            error:
                "Error al obtener las evidencias de la bitácora",
        });
    }
}

/* =====================================================
   POST /:id/evidencias
===================================================== */

export async function agregarEvidenciaBitacora(
    req: Request,
    res: Response
) {
    let storagePathSubido:
        | string
        | null =
        null;

    try {
        const bitacoraId =
            parsePositiveInt(
                req.params.id
            );

        if (!bitacoraId) {
            return res.status(400).json({
                error:
                    "ID de bitácora inválido",
            });
        }

        /*
         * El usuario se obtiene de auth().
         *
         * Nunca debe confiarse en un subidoPorId
         * enviado desde el frontend.
         */
        const subidoPorId =
            obtenerUsuarioAutenticadoId(
                req
            );

        if (!subidoPorId) {
            return res.status(401).json({
                error:
                    "No fue posible identificar al usuario autenticado",
            });
        }

        const file =
            req.file;

        if (!file) {
            return res.status(400).json({
                error:
                    "Debes adjuntar una imagen o video",
            });
        }

        const etapa =
            obtenerEtapa(
                req.body.etapa
            );

        if (!etapa) {
            return res.status(400).json({
                error:
                    "La etapa debe ser ANTES, EN_PROCESO o DESPUES",
            });
        }

        const tipo =
            obtenerTipoDesdeMime(
                file.mimetype
            );

        if (!tipo) {
            return res.status(400).json({
                error:
                    "El formato no está permitido. Solo se aceptan imágenes JPG, PNG, WEBP y videos MP4, WEBM o MOV",
            });
        }

        const errorTamano =
            validarTamanoArchivo(
                file,
                tipo
            );

        if (errorTamano) {
            return res.status(400).json({
                error:
                    errorTamano,
            });
        }

        /*
         * Verificar que realmente exista la bitácora.
         */
        const bitacora =
            await prisma.bitacoraTecnico.findUnique({
                where: {
                    id:
                        bitacoraId,
                },

                select: {
                    id:
                        true,

                    estado:
                        true,

                    tecnicoId:
                        true,
                },
            });

        if (!bitacora) {
            return res.status(404).json({
                error:
                    "Bitácora no encontrada",
            });
        }

        /*
         * Validar también que el usuario autenticado
         * exista como técnico activo.
         *
         * Esto protege la FK subidoPorId.
         */
        const usuario =
            await prisma.tecnico.findFirst({
                where: {
                    id_tecnico:
                        subidoPorId,

                    status:
                        true,
                },

                select: {
                    id_tecnico:
                        true,

                    nombre:
                        true,
                },
            });

        if (!usuario) {
            return res.status(403).json({
                error:
                    "El usuario autenticado no corresponde a un técnico activo",
            });
        }

        /*
         * La evidencia primero se sube al Storage.
         */
        const resultadoStorage =
            await subirEvidenciaBitacoraStorage({
                bitacoraId,
                etapa,
                file,
            });

        storagePathSubido =
            resultadoStorage.storagePath;

        /*
         * Si Storage funcionó, ahora persistimos
         * la referencia en PostgreSQL.
         */
        const evidencia =
            await prisma.bitacoraEvidencia.create({
                data: {
                    bitacoraId,

                    etapaId:
                        etapaRegistro.id,

                    /*
                     * Mantén temporalmente este campo
                     * mientras todavía exista en Prisma.
                     */
                    etapa:
                        etapa as any,

                    tipo,

                    nombre:
                        file.originalname,

                    mimeType:
                        file.mimetype,

                    bytes:
                        file.size,

                    url:
                        null,

                    storagePath:
                        resultadoStorage.storagePath,

                    publicId:
                        randomUUID(),

                    descripcion:
                        normalizarDescripcion(
                            req.body.descripcion
                        ),

                    subidoPorId,
                },

                include: {
                    subidoPor: {
                        select: {
                            id_tecnico:
                                true,

                            nombre:
                                true,

                            email:
                                true,

                            rol:
                                true,
                        },
                    },

                    etapaRegistro:
                        true,
                },
            });
            
        /*
         * Generar URL temporal para que el frontend
         * pueda visualizar inmediatamente el archivo.
         */
        const signedUrl =
            await obtenerUrlFirmadaEvidenciaBitacora(
                evidencia.storagePath
            );

        return res.status(201).json({
            data: {
                ...evidencia,

                /*
                 * Sobrescribe el null de DB solamente
                 * en la respuesta HTTP.
                 */
                url:
                    signedUrl,
            },

            message:
                "Evidencia agregada correctamente",
        });
    } catch (error) {
        /*
         * Si Supabase alcanzó a guardar el archivo
         * pero Prisma falló posteriormente,
         * intentamos limpiar el archivo huérfano.
         */
        if (storagePathSubido) {
            try {
                await eliminarEvidenciaBitacoraStorage(
                    storagePathSubido
                );
            } catch (
            cleanupError
            ) {
                console.error(
                    "⚠️ No se pudo limpiar evidencia huérfana de Supabase:",
                    cleanupError
                );
            }
        }

        console.error(
            "❌ Error agregando evidencia de bitácora:",
            error
        );

        return res.status(500).json({
            error:
                "Error al agregar la evidencia de la bitácora",
        });
    }
}

/* =====================================================
   DELETE /:id/evidencias/:evidenciaId
===================================================== */

export async function eliminarEvidenciaBitacora(
    req: Request,
    res: Response
) {
    try {
        const bitacoraId =
            parsePositiveInt(
                req.params.id
            );

        const evidenciaId =
            parsePositiveInt(
                req.params.evidenciaId
            );

        if (!bitacoraId) {
            return res.status(400).json({
                error:
                    "ID de bitácora inválido",
            });
        }

        if (!evidenciaId) {
            return res.status(400).json({
                error:
                    "ID de evidencia inválido",
            });
        }

        /*
         * Buscar con ambos IDs evita que alguien intente
         * borrar una evidencia perteneciente a otra bitácora.
         */
        const evidencia =
            await prisma.bitacoraEvidencia.findFirst({
                where: {
                    id:
                        evidenciaId,

                    bitacoraId,
                },

                select: {
                    id:
                        true,

                    bitacoraId:
                        true,

                    storagePath:
                        true,

                    nombre:
                        true,

                    subidoPorId:
                        true,
                },
            });

        if (!evidencia) {
            return res.status(404).json({
                error:
                    "Evidencia no encontrada para esta bitácora",
            });
        }

        /*
         * Primero eliminamos el archivo físico.
         *
         * Si Supabase falla, conservamos la referencia
         * en PostgreSQL para no perder trazabilidad.
         */
        await eliminarEvidenciaBitacoraStorage(
            evidencia.storagePath
        );

        /*
         * Solamente después de confirmar el borrado
         * en Storage se elimina la fila.
         */
        await prisma.bitacoraEvidencia.delete({
            where: {
                id:
                    evidencia.id,
            },
        });

        return res.json({
            message:
                "Evidencia eliminada correctamente",

            data: {
                id:
                    evidencia.id,
            },
        });
    } catch (error) {
        console.error(
            "❌ Error eliminando evidencia de bitácora:",
            error
        );

        return res.status(500).json({
            error:
                "Error al eliminar la evidencia de la bitácora",
        });
    }
}