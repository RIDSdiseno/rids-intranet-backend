// src/controllers/controllers-leypd/leypd.controller.ts

import type {
    Request,
    Response,
} from "express";

import {
    listarEmpresasLeypd,
    obtenerDetalleLeypdEmpresa,
    actualizarElementoLeypd,
} from "../../service/leypd/leypd.service.js";

import {
    actualizarElementoLeypdSchema,
    empresaIdSchema,
    numeroElementoSchema,
} from "../../service/leypd/leypd.schemas.js";

/* =====================================================
   LISTAR
===================================================== */

export async function listarLeypd(
    _req: Request,
    res: Response
) {
    try {
        const resultado =
            await listarEmpresasLeypd();

        return res.json(
            resultado
        );
    } catch (error) {
        console.error(
            "[LEYPD] Error listando empresas:",
            error
        );

        return res
            .status(500)
            .json({
                message:
                    "No se pudo obtener el módulo Ley PD.",
            });
    }
}

/* =====================================================
   DETALLE
===================================================== */

export async function obtenerEmpresaLeypd(
    req: Request,
    res: Response
) {
    const parsed =
        empresaIdSchema.safeParse(
            req.params.empresaId
        );

    if (!parsed.success) {
        return res
            .status(400)
            .json({
                message:
                    "ID de empresa inválido.",
            });
    }

    try {
        const resultado =
            await obtenerDetalleLeypdEmpresa(
                parsed.data
            );

        return res.json(
            resultado
        );
    } catch (error) {
        if (
            error instanceof
            Error &&
            error.message ===
            "EMPRESA_NO_ENCONTRADA"
        ) {
            return res
                .status(404)
                .json({
                    message:
                        "Empresa no encontrada.",
                });
        }

        console.error(
            "[LEYPD] Error obteniendo empresa:",
            error
        );

        return res
            .status(500)
            .json({
                message:
                    "No se pudo obtener el detalle Ley PD.",
            });
    }
}

/* =====================================================
   ACTUALIZAR ELEMENTO
===================================================== */

export async function actualizarElementoLeypdController(
    req: Request,
    res: Response
) {
    const empresaIdResult =
        empresaIdSchema.safeParse(
            req.params.empresaId
        );

    const numeroResult =
        numeroElementoSchema.safeParse(
            req.params.numero
        );

    if (
        !empresaIdResult.success ||
        !numeroResult.success
    ) {
        return res
            .status(400)
            .json({
                message:
                    "Parámetros inválidos.",
            });
    }

    const bodyResult =
        actualizarElementoLeypdSchema.safeParse(
            req.body
        );

    if (!bodyResult.success) {
        return res
            .status(400)
            .json({
                message:
                    "Datos inválidos.",

                errors:
                    bodyResult.error.flatten(),
            });
    }

    try {
        const user =
            req.user;

        const {
            estado,
            responsable,
            fechaCompromiso,
            evidencia,
            observaciones,
        } =
            bodyResult.data;

        const resultado =
            await actualizarElementoLeypd(
                empresaIdResult.data,
                numeroResult.data,
                {
                    estado,

                    responsable:
                        responsable ??
                        null,

                    fechaCompromiso:
                        fechaCompromiso
                            ? new Date(
                                `${fechaCompromiso}T00:00:00.000Z`
                            )
                            : null,

                    evidencia:
                        evidencia ??
                        null,

                    observaciones:
                        observaciones ??
                        null,

                    actualizadoPorId:
                        user?.id ??
                        null,
                }
            );

        return res.json(
            resultado
        );
    } catch (error) {
        if (
            error instanceof
            Error
        ) {
            if (
                error.message ===
                "EMPRESA_NO_ENCONTRADA"
            ) {
                return res
                    .status(404)
                    .json({
                        message:
                            "Empresa no encontrada.",
                    });
            }

            if (
                error.message ===
                "ELEMENTO_LEYPD_INVALIDO"
            ) {
                return res
                    .status(400)
                    .json({
                        message:
                            "Elemento Ley PD inválido.",
                    });
            }
        }

        console.error(
            "[LEYPD] Error actualizando elemento:",
            error
        );

        return res
            .status(500)
            .json({
                message:
                    "No se pudo actualizar el elemento Ley PD.",
            });
    }
}