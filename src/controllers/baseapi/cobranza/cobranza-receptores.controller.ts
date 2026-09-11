import type {
    Request,
    Response,
} from "express";

import {
    actualizarContactoCobranza,
    actualizarReceptorCobranza,
    copiarContactosFacturacionACobranza,
    crearContactoCobranza,
    crearReceptorCobranza,
    eliminarContactoCobranza,
    eliminarReceptorCobranza,
    listarReceptoresCobranza,
    obtenerReceptorCobranza,
    obtenerReceptorCobranzaPorRut,
} from "../../../service/baseapi/cobranza/cobranza-receptores.service.js";

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

/* =========================================================
   LISTAR
========================================================= */

export async function getReceptoresCobranza(
    req: Request,
    res: Response
) {
    try {
        const empresaIdRaw =
            req.query.empresaId;

        const empresaId =
            typeof empresaIdRaw ===
                "string"
                ? Number(
                    empresaIdRaw
                )
                : undefined;

        const activo =
            parseBoolean(
                req.query.activo
            );

        const recibeCobranza =
            parseBoolean(
                req.query.recibeCobranza
            );

        const sinContactos =
            parseBoolean(
                req.query.sinContactos
            );

        const resultado =
            await listarReceptoresCobranza({
                ...(typeof req.query.search ===
                    "string"
                    ? {
                        search:
                            req.query.search,
                    }
                    : {}),

                ...(typeof req.query.origen ===
                    "string"
                    ? {
                        origen:
                            req.query.origen,
                    }
                    : {}),

                ...(activo !==
                    undefined
                    ? {
                        activo,
                    }
                    : {}),

                ...(recibeCobranza !==
                    undefined
                    ? {
                        recibeCobranza,
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
            "[RECEPTORES COBRANZA] Error listando",
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

/* =========================================================
   OBTENER POR RUT
========================================================= */

export async function getReceptorCobranzaPorRut(
    req: Request,
    res: Response
) {
    try {
        const rut =
            String(
                req.params.rut ??
                ""
            );

        const receptor =
            await obtenerReceptorCobranzaPorRut(
                rut
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

/* =========================================================
   OBTENER POR ID
========================================================= */

export async function getReceptorCobranza(
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

        const receptor =
            await obtenerReceptorCobranza(
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

/* =========================================================
   CREAR
========================================================= */

export async function postReceptorCobranza(
    req: Request,
    res: Response
) {
    try {
        const {
            rut,
            razonSocial,
            activo,
            recibeCobranza,
            diasCredito,
            empresaId,
            origen,
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

        const resultado =
            await crearReceptorCobranza({
                rut,
                razonSocial,
                activo,
                recibeCobranza,
                diasCredito,
                empresaId,
                origen,
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

/* =========================================================
   ACTUALIZAR
========================================================= */

export async function patchReceptorCobranza(
    req: Request,
    res: Response
) {
    try {
        const id =
            Number(
                req.params.id
            );

        const resultado =
            await actualizarReceptorCobranza(
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

/* =========================================================
   CREAR CONTACTO
========================================================= */

export async function postContactoCobranza(
    req: Request,
    res: Response
) {
    try {
        const receptorId =
            Number(
                req.params.id
            );

        const resultado =
            await crearContactoCobranza(
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

/* =========================================================
   ACTUALIZAR CONTACTO
========================================================= */

export async function patchContactoCobranza(
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
            await actualizarContactoCobranza(
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

/* =========================================================
   ELIMINAR CONTACTO
========================================================= */

export async function deleteContactoCobranza(
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

        await eliminarContactoCobranza(
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

/* =========================================================
   ELIMINAR RECEPTOR
========================================================= */

export async function deleteReceptorCobranza(
    req: Request,
    res: Response
) {
    try {
        const id =
            Number(
                req.params.id
            );

        await eliminarReceptorCobranza(
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

/* =========================================================
   COPIAR DESDE FACTURACIÓN
========================================================= */

export async function postCopiarContactosFacturacion(
    req: Request,
    res: Response
) {
    try {
        const receptorId =
            Number(
                req.params.id
            );

        const resultado =
            await copiarContactosFacturacionACobranza(
                receptorId
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