// src/controllers/controllers-internal/mobile-taller.controller.ts

import type {
    Request,
    Response,
} from "express";

import {
    DestinoEquipoTaller,
    EstadoEquipo,
} from "@prisma/client";

import {
    prismaBase as prisma,
} from "../../lib/prisma.js";

const PRIORIDADES =
    new Set([
        "BAJA",
        "NORMAL",
        "ALTA",
    ]);

const EMAIL_REGEX =
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/* =========================================================
   GENERAR NÚMERO DE ORDEN
========================================================= */

async function generarNumeroOrdenOT(): Promise<string> {
    const year =
        new Date()
            .getFullYear();

    const ultimaOrden =
        await prisma.detalleTrabajoGestioo.findFirst({
            where: {
                numeroOrden: {
                    startsWith:
                        `OT-${year}-`,
                },
            },

            orderBy: {
                id:
                    "desc",
            },

            select: {
                numeroOrden:
                    true,
            },
        });

    let nuevoNumero =
        1;

    if (
        ultimaOrden?.numeroOrden
    ) {
        const partes =
            ultimaOrden
                .numeroOrden
                .split(
                    "-",
                );

        const numeroActual =
            Number(
                partes[2],
            );

        if (
            Number.isFinite(
                numeroActual,
            )
        ) {
            nuevoNumero =
                numeroActual + 1;
        }
    }

    return `OT-${year}-${String(
        nuevoNumero,
    ).padStart(
        4,
        "0",
    )}`;
}

/* =========================================================
   POST /internal/mobile/taller/ingresos
========================================================= */

export async function crearIngresoTallerMobile(
    req: Request,
    res: Response,
) {
    try {
        /* =====================================================
           INPUT
        ===================================================== */

        const equipoId =
            Number(
                req.body?.equipoId,
            );

        const tecnicoId =
            Number(
                req.body?.tecnicoId,
            );

        const entidadId =
            Number(
                req.body?.entidadId,
            );

        const solicitanteFirmanteEntradaId =
            Number(
                req.body
                    ?.solicitanteFirmanteEntradaId,
            );

        const tipoTrabajo =
            String(
                req.body?.tipoTrabajo ??
                "",
            ).trim();

        const descripcion =
            String(
                req.body?.descripcion ??
                "",
            ).trim();

        const notas =
            String(
                req.body?.notas ??
                "",
            ).trim();

        const prioridadRaw =
            String(
                req.body?.prioridad ??
                "NORMAL",
            )
                .trim()
                .toUpperCase();

        const incluyeCargador =
            req.body
                ?.incluyeCargador ===
            true;

        const firmaEntradaUrl =
            String(
                req.body?.firmaEntradaUrl ??
                "",
            ).trim();

        const firmaEntradaPublicId =
            String(
                req.body?.firmaEntradaPublicId ??
                "",
            ).trim();

        const firmaEntradaAtRaw =
            req.body?.firmaEntradaAt;

        /* =====================================================
           VALIDACIONES INPUT
        ===================================================== */

        if (
            !Number.isInteger(
                equipoId,
            ) ||
            equipoId <= 0
        ) {
            return res
                .status(400)
                .json({
                    error:
                        "equipoId inválido",
                });
        }

        if (
            !Number.isInteger(
                tecnicoId,
            ) ||
            tecnicoId <= 0
        ) {
            return res
                .status(400)
                .json({
                    error:
                        "tecnicoId inválido",
                });
        }

        if (
            !Number.isInteger(
                entidadId,
            ) ||
            entidadId <= 0
        ) {
            return res
                .status(400)
                .json({
                    error:
                        "Debe seleccionar una entidad válida",
                });
        }

        if (
            !Number.isInteger(
                solicitanteFirmanteEntradaId,
            ) ||
            solicitanteFirmanteEntradaId <= 0
        ) {
            return res
                .status(400)
                .json({
                    error:
                        "solicitanteFirmanteEntradaId inválido",
                });
        }

        if (!tipoTrabajo) {
            return res
                .status(400)
                .json({
                    error:
                        "El tipo de trabajo es obligatorio",
                });
        }

        if (!descripcion) {
            return res
                .status(400)
                .json({
                    error:
                        "La descripción es obligatoria",
                });
        }

        if (
            !PRIORIDADES.has(
                prioridadRaw,
            )
        ) {
            return res
                .status(400)
                .json({
                    error:
                        "Prioridad inválida",
                });
        }

        if (!firmaEntradaUrl) {
            return res
                .status(400)
                .json({
                    error:
                        "La firma de recepción es obligatoria",
                });
        }

        if (!firmaEntradaPublicId) {
            return res
                .status(400)
                .json({
                    error:
                        "El identificador de la firma de recepción es obligatorio",
                });
        }

        const firmaEntradaAt =
            firmaEntradaAtRaw
                ? new Date(
                    firmaEntradaAtRaw,
                )
                : new Date();

        if (
            Number.isNaN(
                firmaEntradaAt.getTime(),
            )
        ) {
            return res
                .status(400)
                .json({
                    error:
                        "firmaEntradaAt inválida",
                });
        }

        /* =====================================================
           VALIDAR TÉCNICO
        ===================================================== */

        const tecnico =
            await prisma.tecnico.findUnique({
                where: {
                    id_tecnico:
                        tecnicoId,
                },

                select: {
                    id_tecnico:
                        true,

                    nombre:
                        true,

                    email:
                        true,
                },
            });

        if (!tecnico) {
            return res
                .status(400)
                .json({
                    error:
                        "Técnico no válido",
                });
        }

        /* =====================================================
           VALIDAR EQUIPO
        ===================================================== */

        const equipo =
            await prisma.equipo.findUnique({
                where: {
                    id_equipo:
                        equipoId,
                },

                select: {
                    id_equipo:
                        true,

                    serial:
                        true,

                    marca:
                        true,

                    modelo:
                        true,

                    empresaId:
                        true,
                },
            });

        if (!equipo) {
            return res
                .status(404)
                .json({
                    error:
                        "Equipo no encontrado",
                });
        }

        /* =====================================================
           VALIDAR ENTIDAD

           Puede ser PERSONA o EMPRESA.
        ===================================================== */

        const entidad =
            await prisma.entidadGestioo.findUnique({
                where: {
                    id:
                        entidadId,
                },

                select: {
                    id:
                        true,

                    nombre:
                        true,

                    rut:
                        true,

                    tipo:
                        true,

                    origen:
                        true,

                    empresaId:
                        true,
                },
            });

        if (!entidad) {
            return res
                .status(404)
                .json({
                    error:
                        "Entidad no encontrada",
                });
        }

        /* =====================================================
           VALIDAR SOLICITANTE FIRMANTE

           Independiente de la entidad elegida.
        ===================================================== */

        const solicitanteFirmante =
            await prisma.solicitante.findFirst({
                where: {
                    id_solicitante:
                        solicitanteFirmanteEntradaId,

                    isActive:
                        true,

                    deletedAt:
                        null,
                },

                select: {
                    id_solicitante:
                        true,

                    nombre:
                        true,

                    email:
                        true,

                    rut:
                        true,

                    telefono:
                        true,

                    empresaId:
                        true,
                },
            });

        if (!solicitanteFirmante) {
            return res
                .status(404)
                .json({
                    error:
                        "El solicitante firmante no existe o está inactivo",
                });
        }

        /*
         * Snapshot obtenido desde la BD.
         * No confiamos en nombre/correo enviados
         * por el cliente móvil.
         */
        const nombreFirmanteEntrada =
            solicitanteFirmante.nombre
                ?.trim() ??
            "";

        const emailFirmanteEntrada =
            solicitanteFirmante.email
                ?.trim()
                .toLowerCase() ??
            "";

        if (!nombreFirmanteEntrada) {
            return res
                .status(400)
                .json({
                    error:
                        "El solicitante firmante no tiene un nombre válido",
                });
        }

        if (
            !EMAIL_REGEX.test(
                emailFirmanteEntrada,
            )
        ) {
            return res
                .status(400)
                .json({
                    error:
                        "El solicitante firmante no tiene un correo válido",
                });
        }

        /* =====================================================
           GENERAR NÚMERO OT
        ===================================================== */

        const numeroOrden =
            await generarNumeroOrdenOT();

        const fechaTrabajo =
            new Date();

        /* =====================================================
           LOG
        ===================================================== */

        console.log(
            "[MOBILE TALLER INGRESO]",
            {
                numeroOrden,

                equipoId,

                tecnicoId,

                entidadId,

                solicitanteFirmanteEntradaId,

                nombreFirmanteEntrada,

                emailFirmanteEntrada,
            },
        );

        /* =====================================================
           CREAR OT + ACTUALIZAR EQUIPO
        ===================================================== */

        const orden =
            await prisma.$transaction(
                async (tx) => {
                    const nuevoTrabajo =
                        await tx.detalleTrabajoGestioo.create({
                            data: {
                                fecha:
                                    fechaTrabajo,

                                numeroOrden,

                                ordenGrupoId:
                                    null,

                                fechaIngreso:
                                    fechaTrabajo,

                                tipoTrabajo,

                                descripcion,

                                notas:
                                    notas ||
                                    null,

                                area:
                                    "ENTRADA",

                                estado:
                                    "PENDIENTE",

                                prioridad:
                                    prioridadRaw as
                                    | "BAJA"
                                    | "NORMAL"
                                    | "ALTA",

                                entidadId:
                                    entidad.id,

                                productoId:
                                    null,

                                servicioId:
                                    null,

                                equipoId,

                                tecnicoId,

                                incluyeCargador,

                                destinoEquipo:
                                    DestinoEquipoTaller
                                        .SIN_DEFINIR,

                                destinoEquipoNota:
                                    null,

                                solicitanteFirmanteEntradaId:
                                    solicitanteFirmante
                                        .id_solicitante,

                                nombreFirmanteEntrada,

                                emailFirmanteEntrada,

                                firmaEntradaUrl,

                                firmaEntradaPublicId,

                                firmaEntradaAt,
                            },
                        });

                    /*
                     * La entrada es la raíz
                     * de su propio grupo.
                     */
                    await tx.detalleTrabajoGestioo.update({
                        where: {
                            id:
                                nuevoTrabajo.id,
                        },

                        data: {
                            ordenGrupoId:
                                nuevoTrabajo.id,
                        },
                    });

                    /*
                     * Equipo queda EN_RIDS.
                     */
                    await tx.equipo.update({
                        where: {
                            id_equipo:
                                equipoId,
                        },

                        data: {
                            estado:
                                EstadoEquipo.EN_RIDS,
                        },
                    });

                    return tx.detalleTrabajoGestioo.findUnique({
                        where: {
                            id:
                                nuevoTrabajo.id,
                        },

                        include: {
                            entidad:
                                true,

                            equipo: {
                                include: {
                                    solicitante:
                                        true,
                                },
                            },

                            tecnico: {
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
                    });
                },
            );

        if (!orden) {
            return res
                .status(500)
                .json({
                    error:
                        "La orden fue creada pero no pudo recuperarse",
                });
        }

        /* =====================================================
           RESPONSE
        ===================================================== */

        return res
            .status(201)
            .json({
                ok:
                    true,

                orden,

                firmante: {
                    id_solicitante:
                        solicitanteFirmante
                            .id_solicitante,

                    nombre:
                        nombreFirmanteEntrada,

                    email:
                        emailFirmanteEntrada,
                },

                equipo: {
                    id_equipo:
                        equipo.id_equipo,

                    marca:
                        equipo.marca,

                    modelo:
                        equipo.modelo,

                    serial:
                        equipo.serial,
                },
            });
    } catch (error: unknown) {
        console.error(
            "[MOBILE TALLER INGRESO]",
            error,
        );

        if (
            error instanceof Error
        ) {
            return res
                .status(500)
                .json({
                    error:
                        error.message,
                });
        }

        return res
            .status(500)
            .json({
                error:
                    "No se pudo registrar el ingreso al taller",
            });
    }
}