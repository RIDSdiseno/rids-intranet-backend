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