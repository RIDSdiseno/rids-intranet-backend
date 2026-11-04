// src/service/leypd/leypd-actualizacion.service.ts

import {
    prisma,
} from "../../lib/prisma.js";

/* =====================================================
   CREAR JOB
===================================================== */

export async function crearActualizacionLeypd(
    tecnicoId: number
) {
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

    return prisma.leypdActualizacion.create({
        data: {
            estado:
                "PENDIENTE",

            pasoActual:
                0,

            totalPasos:
                9,

            progreso:
                0,

            iniciadoPorId:
                tecnicoId,
        },
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

        include: {
            iniciadoPor: {
                select: {
                    id_tecnico:
                        true,

                    nombre:
                        true,
                },
            },
        },
    });
}

/* =====================================================
   CANCELAR (solo PENDIENTE)
===================================================== */

/**
 * Cancela un trabajo que el worker aún no tomó.
 *
 * updateMany con la condición estado = PENDIENTE es atómico:
 * si el worker lo tomó en el mismo instante, no se cancela.
 */
export async function cancelarActualizacionLeypd(
    id: number
) {
    const resultado =
        await prisma.leypdActualizacion.updateMany({
            where: {
                id,
                estado:
                    "PENDIENTE",
            },

            data: {
                estado:
                    "CANCELADO",

                terminadoAt:
                    new Date(),

                mensaje:
                    "Cancelada antes de que el worker la tomara.",
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