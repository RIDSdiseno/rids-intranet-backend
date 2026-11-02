// src/service/leypd/leypd-ficha.service.ts

import crypto from "node:crypto";

import type {
    Prisma,
} from "@prisma/client";

import {
    prisma,
} from "../../lib/prisma.js";

import {
    FICHA_LEYPD_CAMPOS,
} from "./leypd-ficha-campos.js";

import {
    obtenerSugerenciasFichaLeypd,
} from "./leypd-ficha-sugerencias.service.js";

import {
    validarCambiosFichaLeypd,
    validarObligatoriosFichaLeypd,
} from "./leypd-ficha-validacion.js";

/* =====================================================
   TYPES
===================================================== */

export type FuenteFichaLeypd =
    | "CRM"
    | "RIDS"
    | "CLIENTE_PORTAL"
    | "ENLACE_PUBLICO";

export interface ValorFichaLeypd {
    valor: unknown;
    fuente: FuenteFichaLeypd;
    confirmado: boolean;
    actualizadoPor:
    | string
    | null;
    fecha:
    | string
    | null;
}

export type DatosFichaLeypd =
    Record<
        string,
        ValorFichaLeypd
    >;

/* =====================================================
   HELPERS
===================================================== */

function normalizarDatos(
    value: Prisma.JsonValue | null
): DatosFichaLeypd {
    if (
        !value ||
        typeof value !==
        "object" ||
        Array.isArray(value)
    ) {
        return {};
    }

    return value as unknown as DatosFichaLeypd;
}

function hashToken(
    token: string
): string {
    return crypto
        .createHash(
            "sha256"
        )
        .update(
            token
        )
        .digest(
            "hex"
        );
}

function generarToken() {
    const token =
        crypto
            .randomBytes(
                32
            )
            .toString(
                "hex"
            );

    return {
        token,
        tokenHash:
            hashToken(
                token
            ),
    };
}

function mergeSugerencias(
    actuales: DatosFichaLeypd,
    sugerencias: DatosFichaLeypd
): DatosFichaLeypd {
    const resultado: DatosFichaLeypd =
    {
        ...actuales,
    };

    for (
        const [
            key,
            sugerencia,
        ] of Object.entries(
            sugerencias
        )
    ) {
        if (
            resultado[key]
        ) {
            continue;
        }

        resultado[key] =
            sugerencia;
    }

    return resultado;
}

/* =====================================================
   FICHA INTERNA
===================================================== */

export async function obtenerFichaLeypdInterna(
    empresaId: number
) {
    const empresa =
        await prisma.empresa.findUnique({
            where: {
                id_empresa:
                    empresaId,
            },

            select: {
                id_empresa:
                    true,

                nombre:
                    true,

                razonSocial:
                    true,
            },
        });

    if (!empresa) {
        throw new Error(
            "EMPRESA_NO_ENCONTRADA"
        );
    }

    const [
        ficha,
        sugerencias,
    ] =
        await Promise.all([
            prisma.leypdFicha.findUnique(
                {
                    where: {
                        empresaId,
                    },
                }
            ),

            obtenerSugerenciasFichaLeypd(
                empresaId
            ),
        ]);

    const actuales =
        normalizarDatos(
            ficha?.datos ??
            null
        );

    const datos =
        mergeSugerencias(
            actuales,
            sugerencias as DatosFichaLeypd
        );

    return {
        empresa,

        ficha: {
            id:
                ficha?.id ??
                null,

            datos,

            enlaceCreadoAt:
                ficha?.enlaceCreadoAt ??
                null,

            tokenExpiresAt:
                ficha?.tokenExpiresAt ??
                null,

            tokenRevokedAt:
                ficha?.tokenRevokedAt ??
                null,

            respondidoAt:
                ficha?.respondidoAt ??
                null,

            respondidoPor:
                ficha?.respondidoPor ??
                null,

            fuenteRespuesta:
                ficha?.fuenteRespuesta ??
                null,

            createdAt:
                ficha?.createdAt ??
                null,

            updatedAt:
                ficha?.updatedAt ??
                null,
        },

        campos:
            FICHA_LEYPD_CAMPOS,
    };
}

/* =====================================================
   GUARDAR FICHA INTERNA
===================================================== */

export async function guardarFichaLeypdInterna(
    empresaId: number,
    datos: Record<
        string,
        unknown
    >,
    actorEmail:
        | string
        | null
) {
    const empresa =
        await prisma.empresa.findUnique({
            where: {
                id_empresa:
                    empresaId,
            },

            select: {
                id_empresa:
                    true,
            },
        });

    if (!empresa) {
        throw new Error(
            "EMPRESA_NO_ENCONTRADA"
        );
    }

    validarCambiosFichaLeypd(
        datos
    );

    const actual =
        await prisma.leypdFicha.findUnique({
            where: {
                empresaId,
            },
        });

    const actuales =
        normalizarDatos(
            actual?.datos ??
            null
        );

    const fecha =
        new Date().toISOString();

    const nuevos:
        DatosFichaLeypd =
    {
        ...actuales,
    };

    for (
        const [
            key,
            valor,
        ] of Object.entries(
            datos
        )
    ) {
        nuevos[key] = {
            valor,
            fuente:
                "RIDS",
            confirmado:
                true,
            actualizadoPor:
                actorEmail,
            fecha,
        };
    }

    return prisma.leypdFicha.upsert({
        where: {
            empresaId,
        },

        create: {
            empresaId,

            datos:
                nuevos as unknown as Prisma.InputJsonValue,
        },

        update: {
            datos:
                nuevos as unknown as Prisma.InputJsonValue,
        },
    });
}

/* =====================================================
   GENERAR ENLACE
===================================================== */

export async function generarEnlaceFichaLeypd(
    empresaId: number
) {
    const empresa =
        await prisma.empresa.findUnique({
            where: {
                id_empresa:
                    empresaId,
            },

            select: {
                id_empresa:
                    true,
            },
        });

    if (!empresa) {
        throw new Error(
            "EMPRESA_NO_ENCONTRADA"
        );
    }

    const {
        token,
        tokenHash,
    } =
        generarToken();

    const tokenExpiresAt =
        new Date(
            Date.now() +
            30 *
            24 *
            60 *
            60 *
            1000
        );

    await prisma.leypdFicha.upsert({
        where: {
            empresaId,
        },

        create: {
            empresaId,

            datos: {},

            tokenHash,

            tokenExpiresAt,

            enlaceCreadoAt:
                new Date(),

            tokenRevokedAt:
                null,
        },

        update: {
            tokenHash,

            tokenExpiresAt,

            enlaceCreadoAt:
                new Date(),

            tokenRevokedAt:
                null,

            /*
             * Regenerar enlace reabre la ficha:
             * - vuelve a quedar pendiente de respuesta
             * - se conservan datos y nombreRespondienteBorrador
             * - el token anterior queda inválido al sobrescribir tokenHash
             */
            respondidoAt:
                null,

            respondidoPor:
                null,

            fuenteRespuesta:
                null,
        },
    });

    const frontendUrl =
        process.env
            .FRONTEND_URL;

    if (!frontendUrl) {
        throw new Error(
            "FRONTEND_URL_NO_CONFIGURADO"
        );
    }

    return {
        token,

        url:
            `${frontendUrl.replace(
                /\/$/,
                ""
            )}` +
            `/ficha-leypd/${token}`,

        expiresAt:
            tokenExpiresAt,
    };
}

/* =====================================================
   REVOCAR ENLACE
===================================================== */

export async function revocarEnlaceFichaLeypd(
    empresaId: number
) {
    const ficha =
        await prisma.leypdFicha.findUnique({
            where: {
                empresaId,
            },
        });

    if (!ficha) {
        throw new Error(
            "FICHA_NO_ENCONTRADA"
        );
    }

    return prisma.leypdFicha.update({
        where: {
            empresaId,
        },

        data: {
            tokenRevokedAt:
                new Date(),
        },
    });
}

/* =====================================================
   BUSCAR FICHA PÚBLICA
===================================================== */

async function obtenerFichaPublicaPorToken(
    token: string
) {
    const tokenHash =
        hashToken(
            token
        );

    const ficha =
        await prisma.leypdFicha.findUnique({
            where: {
                tokenHash,
            },

            include: {
                empresa: {
                    select: {
                        id_empresa:
                            true,

                        nombre:
                            true,

                        razonSocial:
                            true,
                    },
                },
            },
        });

    if (!ficha) {
        throw new Error(
            "TOKEN_INVALIDO"
        );
    }

    if (
        ficha.tokenRevokedAt
    ) {
        throw new Error(
            "TOKEN_REVOCADO"
        );
    }

    if (
        ficha.tokenExpiresAt &&
        ficha.tokenExpiresAt <
        new Date()
    ) {
        throw new Error(
            "TOKEN_EXPIRADO"
        );
    }

    return ficha;
}

/* =====================================================
   VALIDAR FICHA ABIERTA
===================================================== */

/**
 * Una ficha enviada (respondidoAt != null) queda cerrada
 * para el enlace público. Para volver a editarla, RIDS
 * debe regenerar el enlace, lo que la reabre.
 */
function asegurarFichaAbierta(
    ficha: {
        respondidoAt: Date | null;
    }
) {
    if (
        ficha.respondidoAt
    ) {
        throw new Error(
            "FICHA_YA_ENVIADA"
        );
    }
}

/* =====================================================
   GET PÚBLICO
===================================================== */

export async function obtenerFichaLeypdPublica(
    token: string
) {
    const ficha =
        await obtenerFichaPublicaPorToken(
            token
        );


    asegurarFichaAbierta(
        ficha
    );

    /*
     * Igual que la ficha interna:
     *
     * - primero tomamos lo realmente guardado en LeypdFicha
     * - luego rellenamos únicamente los campos ausentes
     *   con información disponible en el CRM
     *
     * Una respuesta ya guardada nunca es reemplazada
     * por una sugerencia.
     */

    const actuales =
        normalizarDatos(
            ficha.datos
        );

    const sugerencias =
        await obtenerSugerenciasFichaLeypd(
            ficha.empresa.id_empresa
        );

    const datos =
        mergeSugerencias(
            actuales,
            sugerencias as DatosFichaLeypd
        );

    return {
        empresa: {
            nombre:
                ficha.empresa.nombre,

            razonSocial:
                ficha.empresa.razonSocial,
        },

        datos,

        campos:
            FICHA_LEYPD_CAMPOS,

        nombreRespondienteBorrador:
            ficha.nombreRespondienteBorrador ??
            null,

        respondidoAt:
            ficha.respondidoAt,

        tokenExpiresAt:
            ficha.tokenExpiresAt,
    };
}

/* =====================================================
   GUARDAR PÚBLICO PARCIAL
===================================================== */

export async function guardarFichaLeypdPublica(
    token: string,
    datos: Record<
        string,
        unknown
    >,
    nombre:
        | string
        | null
) {
    const ficha =
        await obtenerFichaPublicaPorToken(
            token
        );

    asegurarFichaAbierta(ficha);


    validarCambiosFichaLeypd(
        datos
    );

    const actuales =
        normalizarDatos(
            ficha.datos
        );

    const fecha =
        new Date().toISOString();

    const nuevos:
        DatosFichaLeypd =
    {
        ...actuales,
    };

    for (
        const [
            key,
            valor,
        ] of Object.entries(
            datos
        )
    ) {
        nuevos[key] = {
            valor,
            fuente:
                "ENLACE_PUBLICO",
            confirmado:
                true,
            actualizadoPor:
                nombre,
            fecha,
        };
    }

    return prisma.leypdFicha.update({
        where: {
            id:
                ficha.id,
        },

        data: {
            datos:
                nuevos as unknown as Prisma.InputJsonValue,

            nombreRespondienteBorrador:
                nombre?.trim() ||
                ficha.nombreRespondienteBorrador ||
                null,
        },
    });
}

/* =====================================================
   ENVIAR FICHA PÚBLICA
===================================================== */

export async function enviarFichaLeypdPublica(
    token: string,
    datos: Record<
        string,
        unknown
    >,
    nombre: string
) {
    const ficha =
        await obtenerFichaPublicaPorToken(
            token
        );

    asegurarFichaAbierta(
        ficha
    );


    validarCambiosFichaLeypd(
        datos
    );

    const actuales =
        normalizarDatos(
            ficha.datos
        );

    const fecha =
        new Date().toISOString();

    const nuevos:
        DatosFichaLeypd =
    {
        ...actuales,
    };

    for (
        const [
            key,
            valor,
        ] of Object.entries(
            datos
        )
    ) {
        nuevos[key] = {
            valor,
            fuente:
                "ENLACE_PUBLICO",
            confirmado:
                true,
            actualizadoPor:
                nombre,
            fecha,
        };
    }

    validarObligatoriosFichaLeypd(
        nuevos
    );

    return prisma.leypdFicha.update({
        where: {
            id:
                ficha.id,
        },

        data: {
            datos:
                nuevos as unknown as Prisma.InputJsonValue,

            nombreRespondienteBorrador:
                nombre,

            respondidoAt:
                new Date(),

            respondidoPor:
                nombre,

            fuenteRespuesta:
                "ENLACE_PUBLICO",
        },
    });
}

/* =====================================================
   PORTAL CLIENTE
===================================================== */

export async function obtenerFichaLeypdCliente(
    empresaId: number
) {
    return obtenerFichaLeypdInterna(
        empresaId
    );
}

export async function guardarFichaLeypdCliente(
    empresaId: number,
    datos: Record<
        string,
        unknown
    >,
    actorEmail:
        | string
        | null
) {
    const actual =
        await prisma.leypdFicha.findUnique({
            where: {
                empresaId,
            },
        });

    const actuales =
        normalizarDatos(
            actual?.datos ??
            null
        );

    const fecha =
        new Date().toISOString();

    const nuevos:
        DatosFichaLeypd =
    {
        ...actuales,
    };

    for (
        const [
            key,
            valor,
        ] of Object.entries(
            datos
        )
    ) {
        nuevos[key] = {
            valor,
            fuente:
                "CLIENTE_PORTAL",
            confirmado:
                true,
            actualizadoPor:
                actorEmail,
            fecha,
        };
    }

    return prisma.leypdFicha.upsert({
        where: {
            empresaId,
        },

        create: {
            empresaId,

            datos:
                nuevos as unknown as Prisma.InputJsonValue,

            respondidoAt:
                new Date(),

            respondidoPor:
                actorEmail,

            fuenteRespuesta:
                "CLIENTE_PORTAL",
        },

        update: {
            datos:
                nuevos as unknown as Prisma.InputJsonValue,

            respondidoAt:
                new Date(),

            respondidoPor:
                actorEmail,

            fuenteRespuesta:
                "CLIENTE_PORTAL",
        },
    });
}