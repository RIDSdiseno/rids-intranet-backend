// src/controllers/baseapi/receptores-sync-crm.controller.ts
import type {
    Request,
    Response,
} from "express";

import {
    sincronizarReceptoresDesdeCrm,
    type ModuloReceptores,
} from "../../service/baseapi/receptores-sync-crm.service.js";

/**
 * POST /…/receptores/sincronizar-crm            → simulación (no escribe)
 * POST /…/receptores/sincronizar-crm?aplicar=1  → aplica
 */
function crearHandler(
    modulo: ModuloReceptores
) {
    return async (
        req: Request,
        res: Response
    ) => {
        const aplicar =
            req.query.aplicar ===
            "1";

        try {
            const resultado =
                await sincronizarReceptoresDesdeCrm(
                    modulo,
                    aplicar
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
            console.error(
                `[RECEPTORES ${modulo}] Error sincronizando desde el CRM`,
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
    };
}

export const postSincronizarReceptoresFacturacionCrm =
    crearHandler(
        "FACTURACION"
    );

export const postSincronizarReceptoresCobranzaCrm =
    crearHandler(
        "COBRANZA"
    );