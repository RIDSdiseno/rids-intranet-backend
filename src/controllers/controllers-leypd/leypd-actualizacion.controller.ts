// src/controllers/controllers-leypd/leypd-actualizacion.controller.ts

import type {
    Request,
    Response,
} from "express";

import {
    crearActualizacionLeypd,
    obtenerActualizacionLeypd,
    obtenerActualizacionActivaLeypd,
} from "../../service/leypd/leypd-actualizacion.service.js";

import {
    actualizacionIdSchema,
} from "../../service/leypd/leypd.schemas.js";

/* =====================================================
   CREAR
===================================================== */

export async function postActualizacionLeypd(
    req: Request,
    res: Response
) {
    const tecnicoId =
        req.user?.id;

    if (!tecnicoId) {
        return res
            .status(401)
            .json({
                message:
                    "Usuario no autenticado.",
            });
    }

    try {
        const job =
            await crearActualizacionLeypd(
                tecnicoId
            );

        return res
            .status(201)
            .json(
                job
            );
    } catch (error) {
        if (
            error instanceof
            Error &&
            error.message ===
            "ACTUALIZACION_EN_CURSO"
        ) {
            return res
                .status(409)
                .json({
                    message:
                        "Ya existe una actualización Ley PD pendiente o en ejecución.",
                });
        }

        console.error(
            "[LEYPD ACTUALIZACION]",
            error
        );

        return res
            .status(500)
            .json({
                message:
                    "No se pudo crear la actualización.",
            });
    }
}

/* =====================================================
   OBTENER
===================================================== */

export async function getActualizacionLeypd(
    req: Request,
    res: Response
) {
    const parsed =
        actualizacionIdSchema.safeParse(
            req.params.id
        );

    if (!parsed.success) {
        return res
            .status(400)
            .json({
                message:
                    "ID inválido.",
            });
    }

    try {
        return res.json(
            await obtenerActualizacionLeypd(
                parsed.data
            )
        );
    } catch (error) {
        if (
            error instanceof
            Error &&
            error.message ===
            "ACTUALIZACION_NO_ENCONTRADA"
        ) {
            return res
                .status(404)
                .json({
                    message:
                        "Actualización no encontrada.",
                });
        }

        return res
            .status(500)
            .json({
                message:
                    "No se pudo obtener la actualización.",
            });
    }
}

/* =====================================================
   ACTIVA
===================================================== */

export async function getActualizacionActivaLeypd(
    _req: Request,
    res: Response
) {
    try {
        return res.json({
            actualizacion:
                await obtenerActualizacionActivaLeypd(),
        });
    } catch (error) {
        console.error(
            "[LEYPD ACTUALIZACION]",
            error
        );

        return res
            .status(500)
            .json({
                message:
                    "No se pudo consultar la actualización activa.",
            });
    }
}