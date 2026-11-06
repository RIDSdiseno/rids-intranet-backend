// src/service/leypd/leypd-actualizacion.service.ts

import {
    prisma,
} from "../../lib/prisma.js";

/** Datos que el panel muestra junto a cada trabajo. */
const INCLUDE_ACTUALIZACION = {
    iniciadoPor: {
        select: {
            id_tecnico:
                true,

            nombre:
                true,
        },
    },

    empresa: {
        select: {
            id_empresa:
                true,

            nombre:
                true,
        },
    },
} as const;

/* =====================================================
   CREAR JOB
===================================================== */

export async function crearActualizacionLeypd(
    tecnicoId: number,
    empresaId?: number
) {
    if (empresaId !== undefined) {
        const vinculo =
            await prisma.leypdSharepoint.findUnique({
                where: {
                    empresaId,
                },

                select: {
                    empresaId:
                        true,
                },
            });

        if (!vinculo) {
            throw new Error(
                "EMPRESA_SIN_CARPETA_LEYPD"
            );
        }
    }

    const activa =
        await prisma.leypdActualizacion.findFirst({
            where: {
                estado: {
                    in: [
                        "PENDIENTE",
                        "EJECUTANDO",
                    ],
                },
            },

            orderBy: {
                createdAt:
                    "desc",
            },
        });

    if (activa) {
        throw new Error(
            "ACTUALIZACION_EN_CURSO"
        );
    }

    /*
 * totalPasos queda null: el worker lo fija con el
 * número de empresas al tomar el trabajo.
 * Sin empresaId = todas las empresas vinculadas.
 */
    return prisma.leypdActualizacion.create({
        data: {
            estado:
                "PENDIENTE",

            iniciadoPorId:
                tecnicoId,

            ...(empresaId !== undefined
                ? { empresaId }
                : {}),
        },

        include:
            INCLUDE_ACTUALIZACION,
    });
}

/* =====================================================
   OBTENER JOB
===================================================== */

export async function obtenerActualizacionLeypd(
    id: number
) {
    const job =
        await prisma.leypdActualizacion.findUnique({
            where: {
                id,
            },

            include:
                INCLUDE_ACTUALIZACION,
        });

    if (!job) {
        throw new Error(
            "ACTUALIZACION_NO_ENCONTRADA"
        );
    }

    return job;
}

/* =====================================================
   ÚLTIMA / ACTIVA
===================================================== */

export async function obtenerActualizacionActivaLeypd() {
    return prisma.leypdActualizacion.findFirst({
        include:
            INCLUDE_ACTUALIZACION,
        where: {
            estado: {
                in: [
                    "PENDIENTE",
                    "EJECUTANDO",
                ],
            },
        },

        orderBy: {
            createdAt:
                "desc",
        },
    });
}

/* =====================================================
   WORKER HELPERS
===================================================== */

export async function marcarActualizacionEjecutando(
    id: number
) {
    return prisma.leypdActualizacion.update({
        where: {
            id,
        },

        data: {
            estado:
                "EJECUTANDO",

            iniciadoAt:
                new Date(),
        },
    });
}

export async function actualizarProgresoLeypd(
    id: number,
    pasoActual: number,
    totalPasos: number,
    mensaje:
        | string
        | null
) {
    const progreso =
        totalPasos >
            0
            ? Math.min(
                100,
                Math.max(
                    0,
                    Math.round(
                        (
                            pasoActual /
                            totalPasos
                        ) *
                        100
                    )
                )
            )
            : 0;

    return prisma.leypdActualizacion.update({
        where: {
            id,
        },

        data: {
            pasoActual,
            totalPasos,
            progreso,
            mensaje,
        },
    });
}

export async function marcarActualizacionCompletada(
    id: number,
    mensaje:
        | string
        | null =
        "Actualización completada correctamente."
) {
    return prisma.leypdActualizacion.update({
        where: {
            id,
        },

        data: {
            estado:
                "COMPLETADO",

            progreso:
                100,

            terminadoAt:
                new Date(),

            mensaje,

            error:
                null,
        },
    });
}

export async function marcarActualizacionError(
    id: number,
    error: string
) {
    return prisma.leypdActualizacion.update({
        where: {
            id,
        },

        data: {
            estado:
                "ERROR",

            terminadoAt:
                new Date(),

            error,
        },
    });
}

/* =====================================================
   ÚLTIMA (cualquier estado)
===================================================== */

/**
 * Último trabajo, para mostrar su resultado
 * (COMPLETADO / ERROR / CANCELADO) en la pantalla.
 */
export async function obtenerUltimaActualizacionLeypd() {
    return prisma.leypdActualizacion.findFirst({
        orderBy: {
            createdAt:
                "desc",
        },

        include:
            INCLUDE_ACTUALIZACION,
    });
}

/* =====================================================
   CANCELAR (PENDIENTE o EJECUTANDO)
===================================================== */

/**
 * PENDIENTE: el worker ya no la toma.
 * EJECUTANDO: el worker termina la empresa en curso, se
 * detiene y deja en el mensaje lo que alcanzó a hacer
 * (solo escribe mientras el trabajo sigue EJECUTANDO).
 *
 * updateMany con la condición de estado es atómico.
 */
export async function cancelarActualizacionLeypd(
    id: number
) {
    const resultado =
        await prisma.leypdActualizacion.updateMany({
            where: {
                id,
                estado: {
                    in: [
                        "PENDIENTE",
                        "EJECUTANDO",
                    ],
                },
            },

            data: {
                estado:
                    "CANCELADO",

                terminadoAt:
                    new Date(),

                mensaje:
                    "Cancelada desde el panel.",
            },
        });

    if (
        resultado.count ===
        0
    ) {
        const job =
            await prisma.leypdActualizacion.findUnique({
                where: {
                    id,
                },

                select: {
                    id:
                        true,
                },
            });

        throw new Error(
            job
                ? "ACTUALIZACION_NO_CANCELABLE"
                : "ACTUALIZACION_NO_ENCONTRADA"
        );
    }

    return obtenerActualizacionLeypd(
        id
    );
}