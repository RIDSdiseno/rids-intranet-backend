// src/controllers/controllers-empresas/empresa-entidad.controller.ts

import type {
    Request,
    Response,
} from "express";

import {
    obtenerRelacionEmpresaEntidades,
    buscarEntidadesDisponibles,
    vincularEntidadEmpresaManual,
    desvincularEntidadEmpresa,
    intentarVincularEmpresaAutomaticamente,
} from "../../service/empresas/empresa-entidad.service.js";


function parsePositiveInt(
    value:
        unknown
): number | null {

    const parsed =
        Number(
            value
        );


    if (
        !Number.isInteger(
            parsed
        ) ||
        parsed <= 0
    ) {
        return null;
    }


    return parsed;
}


/* =====================================================
   ESTADO DE LA RELACIÓN
===================================================== */

export async function getRelacionEmpresaEntidades(
    req:
        Request,

    res:
        Response
) {

    try {

        const empresaId =
            parsePositiveInt(
                req.params.id
            );


        if (
            !empresaId
        ) {
            return res.status(
                400
            ).json({
                error:
                    "ID de empresa inválido",
            });
        }


        const resultado =
            await obtenerRelacionEmpresaEntidades(
                empresaId
            );


        return res.json({
            success:
                true,

            data:
                resultado,
        });

    } catch (
    error:
        any
    ) {

        if (
            error?.message ===
            "EMPRESA_NO_ENCONTRADA"
        ) {
            return res.status(
                404
            ).json({
                error:
                    "Empresa no encontrada",
            });
        }


        console.error(
            "[EMPRESA-ENTIDAD] Error obteniendo relación:",
            error
        );


        return res.status(
            500
        ).json({
            error:
                "No se pudo obtener la relación comercial",
        });
    }
}


/* =====================================================
   BUSCADOR MANUAL
===================================================== */

export async function getEntidadesDisponiblesEmpresa(
    req:
        Request,

    res:
        Response
) {

    try {

        const empresaId =
            parsePositiveInt(
                req.params.id
            );


        if (
            !empresaId
        ) {
            return res.status(
                400
            ).json({
                error:
                    "ID de empresa inválido",
            });
        }


        const search =
            typeof req.query.search ===
                "string"
                ? req.query.search
                : "";


        const entidades =
            await buscarEntidadesDisponibles(
                empresaId,
                search
            );


        return res.json({
            success:
                true,

            data:
                entidades,
        });

    } catch (
    error:
        any
    ) {

        if (
            error?.message ===
            "EMPRESA_NO_ENCONTRADA"
        ) {
            return res.status(
                404
            ).json({
                error:
                    "Empresa no encontrada",
            });
        }


        console.error(
            "[EMPRESA-ENTIDAD] Error buscando entidades:",
            error
        );


        return res.status(
            500
        ).json({
            error:
                "No se pudieron buscar las entidades",
        });
    }
}


/* =====================================================
   VINCULAR MANUALMENTE
===================================================== */

export async function patchVincularEntidadEmpresa(
    req:
        Request,

    res:
        Response
) {

    try {

        const empresaId =
            parsePositiveInt(
                req.params.id
            );


        const entidadId =
            parsePositiveInt(
                req.params.entidadId
            );


        if (
            !empresaId ||
            !entidadId
        ) {
            return res.status(
                400
            ).json({
                error:
                    "Empresa o entidad inválida",
            });
        }


        const entidad =
            await vincularEntidadEmpresaManual(
                empresaId,
                entidadId
            );


        return res.json({
            success:
                true,

            message:
                "Entidad vinculada correctamente",

            data:
                entidad,
        });

    } catch (
    error:
        any
    ) {

        switch (
        error?.message
        ) {

            case "EMPRESA_NO_ENCONTRADA":

                return res.status(
                    404
                ).json({
                    error:
                        "Empresa no encontrada",
                });


            case "ENTIDAD_NO_ENCONTRADA":

                return res.status(
                    404
                ).json({
                    error:
                        "Entidad no encontrada",
                });


            case "ENTIDAD_NO_ES_EMPRESA":

                return res.status(
                    400
                ).json({
                    error:
                        "Solo se pueden relacionar entidades de tipo EMPRESA",
                });


            case "ENTIDAD_VINCULADA_OTRA_EMPRESA":

                return res.status(
                    409
                ).json({
                    error:
                        "La entidad ya está relacionada con otra empresa",
                });
        }


        console.error(
            "[EMPRESA-ENTIDAD] Error vinculando:",
            error
        );


        return res.status(
            500
        ).json({
            error:
                "No se pudo vincular la entidad",
        });
    }
}


/* =====================================================
   DESVINCULAR
===================================================== */

export async function deleteVinculoEntidadEmpresa(
    req:
        Request,

    res:
        Response
) {

    try {

        const empresaId =
            parsePositiveInt(
                req.params.id
            );


        const entidadId =
            parsePositiveInt(
                req.params.entidadId
            );


        if (
            !empresaId ||
            !entidadId
        ) {
            return res.status(
                400
            ).json({
                error:
                    "Empresa o entidad inválida",
            });
        }


        await desvincularEntidadEmpresa(
            empresaId,
            entidadId
        );


        return res.json({
            success:
                true,

            message:
                "Entidad desvinculada correctamente",
        });

    } catch (
    error:
        any
    ) {

        if (
            error?.message ===
            "RELACION_NO_ENCONTRADA"
        ) {
            return res.status(
                404
            ).json({
                error:
                    "La relación indicada no existe",
            });
        }


        console.error(
            "[EMPRESA-ENTIDAD] Error desvinculando:",
            error
        );


        return res.status(
            500
        ).json({
            error:
                "No se pudo desvincular la entidad",
        });
    }
}


/* =====================================================
   INTENTAR VÍNCULO AUTOMÁTICO
===================================================== */

export async function postVincularEntidadAutomaticamente(
    req:
        Request,

    res:
        Response
) {

    try {

        const empresaId =
            parsePositiveInt(
                req.params.id
            );


        if (
            !empresaId
        ) {
            return res.status(
                400
            ).json({
                error:
                    "ID de empresa inválido",
            });
        }


        const resultado =
            await intentarVincularEmpresaAutomaticamente(
                empresaId
            );


        return res.json({
            success:
                true,

            data:
                resultado,
        });

    } catch (
    error
    ) {

        console.error(
            "[EMPRESA-ENTIDAD] Error en vinculación automática:",
            error
        );


        return res.status(
            500
        ).json({
            error:
                "No se pudo ejecutar la vinculación automática",
        });
    }
}