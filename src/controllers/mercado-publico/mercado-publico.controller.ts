import type {
    Request,
    Response,
} from "express";

import {
    EstadoOportunidadMercadoPublico,
} from "@prisma/client";

import {
    z,
} from "zod";

import {
    cambiarEstadoMercadoPublico,
    convertirMercadoPublicoAFunnel,
    listarOportunidadesMercadoPublico,
    sincronizarOportunidadesMercadoPublico,
} from "../../service/mercado-publico/mercado-publico.service.js";


const filtrosSchema =
    z.object({

        texto:
            z.string()
                .trim()
                .optional(),

        estado:
            z.nativeEnum(
                EstadoOportunidadMercadoPublico
            )
                .optional(),

        scoreMin:
            z.coerce
                .number()
                .int()
                .min(
                    0
                )
                .max(
                    100
                )
                .optional(),

        region:
            z.string()
                .trim()
                .optional(),

        page:
            z.coerce
                .number()
                .int()
                .positive()
                .default(
                    1
                ),

        limit:
            z.coerce
                .number()
                .int()
                .positive()
                .max(
                    100
                )
                .default(
                    30
                ),
    });


const idSchema =
    z.object({
        id:
            z.coerce
                .number()
                .int()
                .positive(),
    });


const estadoSchema =
    z.object({
        estado:
            z.nativeEnum(
                EstadoOportunidadMercadoPublico
            ),
    });


function getActorId(
    req:
        Request
): number | null {

    const user =
        (
            req as any
        ).user;


    const id =
        Number(
            user?.id
        );


    return Number.isInteger(
        id
    ) &&
        id >
        0
        ? id
        : null;
}


export async function listarMercadoPublicoController(
    req:
        Request,
    res:
        Response
) {

    const parsed =
        filtrosSchema
            .safeParse(
                req.query
            );


    if (
        !parsed.success
    ) {

        return res
            .status(
                400
            )
            .json({
                success:
                    false,

                code:
                    "FILTROS_INVALIDOS",

                errors:
                    parsed
                        .error
                        .flatten(),
            });
    }


    try {

        const result =
            await listarOportunidadesMercadoPublico({
                page:
                    parsed.data.page,

                limit:
                    parsed.data.limit,

                ...(parsed.data.texto !== undefined
                    ? {
                        texto:
                            parsed.data.texto,
                    }
                    : {}),

                ...(parsed.data.estado !== undefined
                    ? {
                        estado:
                            parsed.data.estado,
                    }
                    : {}),

                ...(parsed.data.scoreMin !== undefined
                    ? {
                        scoreMin:
                            parsed.data.scoreMin,
                    }
                    : {}),

                ...(parsed.data.region !== undefined
                    ? {
                        region:
                            parsed.data.region,
                    }
                    : {}),
            });


        return res.json({
            success:
                true,

            ...result,
        });

    } catch (
    error
    ) {

        console.error(
            "[MERCADO PUBLICO] Listado:",
            error
        );


        return res
            .status(
                500
            )
            .json({
                success:
                    false,

                message:
                    "No fue posible listar las oportunidades.",
            });
    }
}


export async function sincronizarMercadoPublicoController(
    _req:
        Request,
    res:
        Response
) {

    try {

        const data =
            await sincronizarOportunidadesMercadoPublico();


        return res.json({
            success:
                true,

            data,
        });

    } catch (
    error
    ) {

        console.error(
            "[MERCADO PUBLICO] Sincronización:",
            error
        );


        return res
            .status(
                500
            )
            .json({
                success:
                    false,

                message:
                    error instanceof
                        Error
                        ? error.message
                        : "Error sincronizando Mercado Público",
            });
    }
}


export async function actualizarEstadoMercadoPublicoController(
    req:
        Request,
    res:
        Response
) {

    const params =
        idSchema
            .safeParse(
                req.params
            );


    const body =
        estadoSchema
            .safeParse(
                req.body
            );


    if (
        !params.success ||
        !body.success
    ) {

        return res
            .status(
                400
            )
            .json({
                success:
                    false,

                message:
                    "Datos inválidos",
            });
    }


    try {

        const data =
            await cambiarEstadoMercadoPublico(
                params.data.id,
                body.data.estado
            );


        return res.json({
            success:
                true,

            data,
        });

    } catch (
    error
    ) {

        return res
            .status(
                500
            )
            .json({
                success:
                    false,

                message:
                    error instanceof
                        Error
                        ? error.message
                        : "Error actualizando oportunidad",
            });
    }
}


export async function convertirMercadoPublicoController(
    req:
        Request,
    res:
        Response
) {

    const params =
        idSchema
            .safeParse(
                req.params
            );


    if (
        !params.success
    ) {

        return res
            .status(
                400
            )
            .json({
                success:
                    false,

                message:
                    "ID inválido",
            });
    }


    const actorId =
        getActorId(
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
                success:
                    false,

                code:
                    "NO_AUTENTICADO",
            });
    }


    try {

        const data =
            await convertirMercadoPublicoAFunnel(
                params.data.id,
                actorId
            );


        return res
            .status(
                201
            )
            .json({
                success:
                    true,

                data,
            });

    } catch (
    error
    ) {

        const message =
            error instanceof
                Error
                ? error.message
                : "Error convirtiendo oportunidad";


        return res
            .status(
                message.includes(
                    "ya fue convertida"
                )
                    ? 409
                    : 400
            )
            .json({
                success:
                    false,

                message,
            });
    }
}