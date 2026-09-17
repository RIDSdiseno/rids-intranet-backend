// src/controllers/controllers-bitacora-tecnico/bitacora-etapas.controller.ts

import type {
    Request,
    Response,
} from "express";

import {
    EstadoEtapaBitacora,
    EtapaBitacora,
    TipoEventoBitacora,
} from "@prisma/client";

import {
    prismaBase as prisma,
} from "../../lib/prisma.js";

function parsePositiveInt(
    value:
        unknown
):
    | number
    | undefined {
    const n =
        Number(
            value
        );

    return Number.isInteger(
        n
    ) &&
        n > 0
        ? n
        : undefined;
}

function normalizeText(
    value:
        unknown
):
    | string
    | null {
    if (
        typeof value !==
        "string"
    ) {
        return null;
    }

    const text =
        value
            .trim()
            .replace(
                /\s+/g,
                " "
            );

    return text ||
        null;
}

function obtenerUsuarioId(
    req:
        Request
):
    | number
    | undefined {
    const user =
        (
            req as Request & {
                user?: {
                    id?: number;
                    id_tecnico?: number;
                    tecnicoId?: number;
                    userId?: number;
                };
            }
        ).user;

    return (
        parsePositiveInt(
            user?.id_tecnico
        ) ??
        parsePositiveInt(
            user?.tecnicoId
        ) ??
        parsePositiveInt(
            user?.id
        ) ??
        parsePositiveInt(
            user?.userId
        )
    );
}

export async function obtenerEtapasBitacora(
    req:
        Request,
    res:
        Response
) {
    try {
        const bitacoraId =
            parsePositiveInt(
                req.params.id
            );

        if (
            !bitacoraId
        ) {
            return res
                .status(
                    400
                )
                .json({
                    error:
                        "ID de bitácora inválido",
                });
        }

        const bitacora =
            await prisma.bitacoraTecnico.findUnique({
                where: {
                    id:
                        bitacoraId,
                },

                select: {
                    id:
                        true,
                },
            });

        if (
            !bitacora
        ) {
            return res
                .status(
                    404
                )
                .json({
                    error:
                        "Bitácora no encontrada",
                });
        }

        const etapas =
            await prisma.bitacoraEtapa.findMany({
                where: {
                    bitacoraId,
                },

                orderBy: {
                    id:
                        "asc",
                },

                include: {
                    evidencias: {
                        orderBy: {
                            createdAt:
                                "asc",
                        },
                    },

                    aprobaciones: {
                        orderBy: {
                            solicitadoAt:
                                "desc",
                        },

                        include: {
                            solicitadoPor: {
                                select: {
                                    id_tecnico:
                                        true,

                                    nombre:
                                        true,

                                    email:
                                        true,
                                },
                            },

                            aprobador: {
                                select: {
                                    id_tecnico:
                                        true,

                                    nombre:
                                        true,

                                    email:
                                        true,
                                },
                            },
                        },
                    },
                },
            });

        return res.json({
            data:
                etapas,
        });
    } catch (
        error
    ) {
        console.error(
            "❌ Error obteniendo etapas de bitácora:",
            error
        );

        return res
            .status(
                500
            )
            .json({
                error:
                    "Error al obtener etapas de la bitácora",
            });
    }
}

export async function actualizarEtapaBitacora(
    req:
        Request,
    res:
        Response
) {
    try {
        const bitacoraId =
            parsePositiveInt(
                req.params.id
            );

        const etapaId =
            parsePositiveInt(
                req.params.etapaId
            );

        if (
            !bitacoraId ||
            !etapaId
        ) {
            return res
                .status(
                    400
                )
                .json({
                    error:
                        "IDs inválidos",
                });
        }

        const actorId =
            obtenerUsuarioId(
                req
            );

        if (
            !actorId
        ) {
            return res
                .status(
                    401
                )
                .json({
                    error:
                        "No fue posible identificar al usuario autenticado",
                });
        }

        const existente =
            await prisma.bitacoraEtapa.findFirst({
                where: {
                    id:
                        etapaId,

                    bitacoraId,
                },
            });

        if (
            !existente
        ) {
            return res
                .status(
                    404
                )
                .json({
                    error:
                        "Etapa no encontrada",
                });
        }

        const descripcion =
            normalizeText(
                req.body.descripcion
            );

        const titulo =
            normalizeText(
                req.body.titulo
            );

        const requiereRevision =
            typeof req.body
                .requiereRevision ===
            "boolean"
                ? req.body
                    .requiereRevision
                : existente
                    .requiereRevision;

        const etapa =
            await prisma.$transaction(
                async (
                    tx
                ) => {
                    const actualizada =
                        await tx.bitacoraEtapa.update({
                            where: {
                                id:
                                    etapaId,
                            },

                            data: {
                                titulo,
                                descripcion,
                                requiereRevision,
                            },
                        });

                    await tx.bitacoraEvento.create({
                        data: {
                            bitacoraId,

                            etapaId,

                            actorId,

                            tipo:
                                TipoEventoBitacora.ETAPA_ACTUALIZADA,

                            descripcion:
                                `Etapa ${existente.etapa} actualizada`,
                        },
                    });

                    return actualizada;
                }
            );

        return res.json({
            data:
                etapa,
        });
    } catch (
        error
    ) {
        console.error(
            "❌ Error actualizando etapa:",
            error
        );

        return res
            .status(
                500
            )
            .json({
                error:
                    "Error al actualizar la etapa",
            });
    }
}