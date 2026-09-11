import type {
    Request,
    Response,
} from "express";

import {
    obtenerDashboardFinanzas,
} from "../../service/baseapi/finanzas/finanzas-dashboard.service.js";

import type {
    EmpresaKey,
} from "../../service/baseapi/cobranza/cobranza-estado.service.js";

function parseEmpresa(
    value: unknown
): EmpresaKey {
    const empresa =
        String(
            value ??
            ""
        )
            .trim()
            .toLowerCase();

    if (
        empresa !==
        "econnet" &&
        empresa !==
        "rids"
    ) {
        throw new Error(
            "Empresa inválida. Usa empresa=econnet o empresa=rids."
        );
    }

    return empresa;
}

function parseAno(
    value: unknown
): number {
    const ano =
        Number(
            value
        );

    if (
        !Number.isInteger(
            ano
        ) ||
        ano <
        2000 ||
        ano >
        2100
    ) {
        throw new Error(
            "Año inválido."
        );
    }

    return ano;
}

export async function getFinanzasDashboard(
    req: Request,
    res: Response
) {
    try {
        const empresaKey =
            parseEmpresa(
                req.query
                    .empresa
            );

        const ano =
            parseAno(
                req.query
                    .ano
            );

        const data =
            await obtenerDashboardFinanzas({
                empresaKey,
                ano,
            });

        return res.json({
            ok:
                true,

            data,
        });
    } catch (
    error
    ) {
        const message =
            error instanceof Error
                ? error.message
                : String(
                    error
                );

        console.error(
            "[FINANZAS DASHBOARD] Error:",
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
                    message,

                message,
            });
    }
}