import type {
    Request,
    Response,
} from "express";

import {
    procesarCobranzaAutomatica,
} from "../../service/baseapi/cobranza/cobranza-automatico.service.js";

import {
    type EmpresaKey,
} from "../../service/baseapi/cobranza/cobranza-estado.service.js";

import {
    procesarEnviosCobranza,
} from "../../service/baseapi/cobranza/cobranza-envio.service.js";

export async function simularCobranzaAutomatica(
    req: Request,
    res: Response
) {
    try {
        const mesesRaw =
            Number(
                req.body?.mesesAnalizar ??
                req.query?.mesesAnalizar ??
                12
            );

        const mesesAnalizar =
            Number.isFinite(mesesRaw)
                ? Math.max(
                    1,
                    Math.min(
                        Math.trunc(mesesRaw),
                        24
                    )
                )
                : 12;

        const empresaRaw =
            String(
                req.body?.empresa ??
                req.query?.empresa ??
                ""
            )
                .trim()
                .toLowerCase();

        let empresas:
            | Array<"econnet" | "rids">
            | undefined;

        if (
            empresaRaw === "econnet" ||
            empresaRaw === "rids"
        ) {
            empresas = [
                empresaRaw,
            ];
        }

        const resultado =
            await procesarCobranzaAutomatica({
                mesesAnalizar,
                ...(empresas
                    ? {
                        empresas,
                    }
                    : {}),
            });

        return res.json({
            ok: true,
            ...resultado,
        });
    } catch (error) {
        const message =
            error instanceof Error
                ? error.message
                : String(error);

        console.error(
            "[COBRANZA AUTO] Error simulando cobranza:",
            error
        );

        return res.status(500).json({
            ok: false,
            error: message,
            message,
        });
    }
}

export async function prepararCobranzaAutomatica(
    req: Request,
    res: Response
) {
    try {
        const mesesAnalizar =
            Number(
                req.body
                    ?.mesesAnalizar ??
                3
            );

        const empresaRaw =
            String(
                req.body
                    ?.empresa ??
                ""
            )
                .trim()
                .toLowerCase();

        const empresas:
            EmpresaKey[] =
            empresaRaw
                ? [
                    empresaRaw as
                    EmpresaKey,
                ]
                : [
                    "econnet",
                    "rids",
                ];

        const resultado =
            await procesarCobranzaAutomatica({
                mesesAnalizar,

                empresas,

                registrarPendientes:
                    true,
            });

        return res.json({
            ok:
                true,

            ...resultado,
        });
    } catch (
    error
    ) {
        console.error(
            "❌ Error preparando cobranza automática:",
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

export async function enviarCobranzaPendiente(
    req: Request,
    res: Response
) {
    try {
        const empresaRaw =
            String(
                req.body
                    ?.empresa ??
                ""
            )
                .trim()
                .toLowerCase();

        const limite =
            Number(
                req.body
                    ?.limite ??
                20
            );

        const resultado =
            await procesarEnviosCobranza({
                ...(empresaRaw
                    ? {
                        empresa:
                            empresaRaw as
                            EmpresaKey,
                    }
                    : {}),

                limite,
            });

        return res.json({
            ok:
                true,

            modo:
                process.env
                    .COBRANZA_TEST_EMAIL
                    ? "PRUEBA"
                    : "REAL",

            testEmail:
                process.env
                    .COBRANZA_TEST_EMAIL ??
                null,

            ...resultado,
        });
    } catch (
    error
    ) {
        console.error(
            "❌ Error enviando cobranza pendiente:",
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