// src/controllers/baseapi/facturas/factura-receptores-.controller.ts
import type {
    Request,
    Response,
} from "express";

import {
    listarReceptoresFacturacion,
    obtenerReceptorFacturacion,
    actualizarReceptorFacturacion,
    crearReceptorFacturacion,
    crearContactoReceptor,
    actualizarContactoReceptor,
    eliminarContactoReceptor,
    eliminarReceptorFacturacion
} from "../../../service/baseapi/facturas/factura-receptores.service.js";

function parseBoolean(
    value: unknown
): boolean | undefined {
    if (
        value ===
        "true"
    ) {
        return true;
    }

    if (
        value ===
        "false"
    ) {
        return false;
    }

    return undefined;
}

export async function postReceptorFacturacion(
    req: Request,
    res: Response
) {
    try {
        const {
            rut,
            razonSocial,
            activo,
        } =
            req.body ??
            {};

        if (
            typeof rut !==
            "string" ||
            !rut.trim()
        ) {
            return res
                .status(
                    400
                )
                .json({
                    ok:
                        false,

                    error:
                        "El RUT es obligatorio",
                });
        }

        if (
            razonSocial !==
            undefined &&
            razonSocial !==
            null &&
            typeof razonSocial !==
            "string"
        ) {
            return res
                .status(
                    400
                )
                .json({
                    ok:
                        false,

                    error:
                        "La razón social no es válida",
                });
        }

        if (
            activo !==
            undefined &&
            typeof activo !==
            "boolean"
        ) {
            return res
                .status(
                    400
                )
                .json({
                    ok:
                        false,

                    error:
                        "El estado activo no es válido",
                });
        }

        const resultado =
            await crearReceptorFacturacion({
                rut,

                ...(razonSocial !==
                    undefined
                    ? {
                        razonSocial,
                    }
                    : {}),

                ...(activo !==
                    undefined
                    ? {
                        activo,
                    }
                    : {}),
            });

        return res
            .status(
                201
            )
            .json({
                ok:
                    true,

                data:
                    resultado,
            });
    } catch (
    error
    ) {
        return res
            .status(
                400
            )
            .json({
                ok:
                    false,

                error:
                    error instanceof Error
                        ? error.message
                        : String(
                            error
                        ),
            });
    }
}

export async function getReceptoresFacturacion(
    req: Request,
    res: Response
) {
    try {
        const empresaIdRaw =
            req.query
                .empresaId;

        const empresaId =
            typeof empresaIdRaw ===
                "string"
                ? Number(
                    empresaIdRaw
                )
                : null;

        const activo =
            parseBoolean(
                req.query
                    .activo
            );

        const recibeFacturas =
            parseBoolean(
                req.query
                    .recibeFacturas
            );

        const sinContactos =
            parseBoolean(
                req.query
                    .sinContactos
            );

        const resultado =
            await listarReceptoresFacturacion({
                ...(typeof req.query.search ===
                    "string"
                    ? {
                        search:
                            req.query
                                .search,
                    }
                    : {}),

                ...(typeof req.query.origen ===
                    "string"
                    ? {
                        origen:
                            req.query
                                .origen,
                    }
                    : {}),

                ...(activo !==
                    undefined
                    ? {
                        activo,
                    }
                    : {}),

                ...(recibeFacturas !==
                    undefined
                    ? {
                        recibeFacturas,
                    }
                    : {}),

                ...(sinContactos !==
                    undefined
                    ? {
                        sinContactos,
                    }
                    : {}),

                ...(typeof empresaId ===
                    "number" &&
                    Number.isInteger(
                        empresaId
                    ) &&
                    empresaId >
                    0
                    ? {
                        empresaId,
                    }
                    : {}),
            });

        return res.json({
            ok:
                true,

            total:
                resultado.length,

            data:
                resultado,
        });
    } catch (
    error
    ) {
        console.error(
            "[RECEPTORES FACTURACIÓN] Error listando",
            error
        );

        return res
            .status(
                500
            )
            .json({
                ok:
                    false,

                error:
                    error instanceof Error
                        ? error.message
                        : String(
                            error
                        ),
            });
    }
}

export async function getReceptorFacturacion(
    req: Request,
    res: Response
) {
    try {
        const id =
            Number(
                req.params.id
            );

        if (
            !Number.isInteger(
                id
            )
        ) {
            return res
                .status(
                    400
                )
                .json({
                    ok:
                        false,

                    error:
                        "ID inválido",
                });
        }

        const receptor =
            await obtenerReceptorFacturacion(
                id
            );

        if (
            !receptor
        ) {
            return res
                .status(
                    404
                )
                .json({
                    ok:
                        false,

                    error:
                        "Receptor no encontrado",
                });
        }

        return res.json({
            ok:
                true,

            data:
                receptor,
        });
    } catch (
    error
    ) {
        return res
            .status(
                500
            )
            .json({
                ok:
                    false,

                error:
                    error instanceof Error
                        ? error.message
                        : String(
                            error
                        ),
            });
    }
}

export async function patchReceptorFacturacion(
    req: Request,
    res: Response
) {
    try {
        const id =
            Number(
                req.params.id
            );

        const resultado =
            await actualizarReceptorFacturacion(
                id,
                req.body ??
                {}
            );

        return res.json({
            ok:
                true,

            data:
                resultado,
        });
    } catch (
    error
    ) {
        return res
            .status(
                400
            )
            .json({
                ok:
                    false,

                error:
                    error instanceof Error
                        ? error.message
                        : String(
                            error
                        ),
            });
    }
}

export async function postContactoReceptor(
    req: Request,
    res: Response
) {
    try {
        const receptorId =
            Number(
                req.params.id
            );

        const resultado =
            await crearContactoReceptor(
                receptorId,
                req.body
            );

        return res
            .status(
                201
            )
            .json({
                ok:
                    true,

                data:
                    resultado,
            });
    } catch (
    error
    ) {
        return res
            .status(
                400
            )
            .json({
                ok:
                    false,

                error:
                    error instanceof Error
                        ? error.message
                        : String(
                            error
                        ),
            });
    }
}

export async function patchContactoReceptor(
    req: Request,
    res: Response
) {
    try {
        const receptorId =
            Number(
                req.params.id
            );

        const contactoId =
            Number(
                req.params.contactoId
            );

        const resultado =
            await actualizarContactoReceptor(
                receptorId,
                contactoId,
                req.body ??
                {}
            );

        return res.json({
            ok:
                true,

            data:
                resultado,
        });
    } catch (
    error
    ) {
        return res
            .status(
                400
            )
            .json({
                ok:
                    false,

                error:
                    error instanceof Error
                        ? error.message
                        : String(
                            error
                        ),
            });
    }
}

export async function deleteContactoReceptor(
    req: Request,
    res: Response
) {
    try {
        const receptorId =
            Number(
                req.params.id
            );

        const contactoId =
            Number(
                req.params.contactoId
            );

        await eliminarContactoReceptor(
            receptorId,
            contactoId
        );

        return res.json({
            ok:
                true,
        });
    } catch (
    error
    ) {
        return res
            .status(
                400
            )
            .json({
                ok:
                    false,

                error:
                    error instanceof Error
                        ? error.message
                        : String(
                            error
                        ),
            });
    }
}

export async function deleteReceptorFacturacion(
    req: Request,
    res: Response
) {
    try {
        const id =
            Number(
                req.params.id
            );

        if (
            !Number.isInteger(
                id
            ) ||
            id <=
            0
        ) {
            return res
                .status(
                    400
                )
                .json({
                    ok:
                        false,

                    error:
                        "ID inválido",
                });
        }

        await eliminarReceptorFacturacion(
            id
        );

        return res.json({
            ok:
                true,
        });
    } catch (
    error
    ) {
        return res
            .status(
                400
            )
            .json({
                ok:
                    false,

                error:
                    error instanceof Error
                        ? error.message
                        : String(
                            error
                        ),
            });
    }
}