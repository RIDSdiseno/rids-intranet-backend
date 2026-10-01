import type {
    Request,
    Response,
} from "express";

import {
    obtenerAnalisisClientesFinanzas,
} from "../../service/baseapi/finanzas/finanzas-clientes.service.js";

import type {
    EmpresaBaseApiKey,
} from "../../service/baseapi/baseapi.empresas.js";

function parseEmpresa(
    value: unknown
): EmpresaBaseApiKey {
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
            "Empresa inválida."
        );
    }

    return empresa;
}

function parseAno(
    value: unknown
): number | undefined {
    if (
        value ===
        undefined ||
        value ===
        null ||
        value ===
        ""
    ) {
        return undefined;
    }

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

export async function getFinanzasClientes(
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
            await obtenerAnalisisClientesFinanzas({
                empresaKey,

                ...(ano
                    ? {
                        ano,
                    }
                    : {}),
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
            error instanceof
                Error
                ? error.message
                : String(
                    error
                );

        console.error(
            "[FINANZAS CLIENTES] Error:",
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
            });
    }
}