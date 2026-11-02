// src/service/leypd/leypd.service.ts

import type {
    LeypdElemento,
} from "@prisma/client";

import {
    prisma,
} from "../../lib/prisma.js";

import {
    LEYPD_ELEMENTOS,
    TOTAL_ELEMENTOS_LEYPD,
    obtenerElementoCatalogo,
} from "./leypd-catalogo.js";

/* =====================================================
   TYPES
===================================================== */

export type EstadoLeypd =
    | "NO_INICIADO"
    | "EN_PROGRESO"
    | "IMPLEMENTADO"
    | "NO_APLICA";

export interface ActualizarElementoLeypdInput {
    estado: EstadoLeypd;

    responsable?:
    | string
    | null;

    fechaCompromiso?:
    | Date
    | null;

    evidencia?:
    | string
    | null;

    observaciones?:
    | string
    | null;

    actualizadoPorId?:
    | number
    | null;
}

/* =====================================================
   HELPERS
===================================================== */

function combinarElementosConCatalogo(
    registros: LeypdElemento[]
) {
    const porNumero =
        new Map(
            registros.map(
                (registro) => [
                    registro.numero,
                    registro,
                ]
            )
        );

    return LEYPD_ELEMENTOS.map(
        (catalogo) => {
            const registro =
                porNumero.get(
                    catalogo.numero
                );

            return {
                ...catalogo,

                id:
                    registro?.id ??
                    null,

                estado:
                    (
                        registro?.estado ??
                        "NO_INICIADO"
                    ) as EstadoLeypd,

                responsable:
                    registro?.responsable ??
                    null,

                fechaCompromiso:
                    registro?.fechaCompromiso ??
                    null,

                evidencia:
                    registro?.evidencia ??
                    null,

                observaciones:
                    registro?.observaciones ??
                    null,

                actualizadoPorId:
                    registro
                        ?.actualizadoPorId ??
                    null,

                createdAt:
                    registro?.createdAt ??
                    null,

                updatedAt:
                    registro?.updatedAt ??
                    null,
            };
        }
    );
}

function calcularResumenLeypd(
    elementos: ReturnType<
        typeof combinarElementosConCatalogo
    >
) {
    const implementados =
        elementos.filter(
            (item) =>
                item.estado ===
                "IMPLEMENTADO"
        ).length;

    const noAplica =
        elementos.filter(
            (item) =>
                item.estado ===
                "NO_APLICA"
        ).length;

    const enProgreso =
        elementos.filter(
            (item) =>
                item.estado ===
                "EN_PROGRESO"
        ).length;

    const sinIniciar =
        elementos.filter(
            (item) =>
                item.estado ===
                "NO_INICIADO"
        ).length;

    const completados =
        implementados +
        noAplica;

    const porcentaje =
        TOTAL_ELEMENTOS_LEYPD >
            0
            ? Math.round(
                (
                    completados /
                    TOTAL_ELEMENTOS_LEYPD
                ) *
                100
            )
            : 0;

    const ahora =
        new Date();

    const vencidos =
        elementos.filter(
            (item) => {
                if (
                    !item.fechaCompromiso
                ) {
                    return false;
                }

                return (
                    item.fechaCompromiso <
                    ahora &&
                    item.estado !==
                    "IMPLEMENTADO" &&
                    item.estado !==
                    "NO_APLICA"
                );
            }
        ).length;

    const ultimaActualizacion =
        elementos
            .map(
                (item) =>
                    item.updatedAt
            )
            .filter(
                (
                    fecha
                ): fecha is Date =>
                    fecha instanceof
                    Date
            )
            .sort(
                (a, b) =>
                    b.getTime() -
                    a.getTime()
            )[0] ??
        null;

    return {
        total:
            TOTAL_ELEMENTOS_LEYPD,

        implementados,
        noAplica,
        enProgreso,
        sinIniciar,

        completados,
        porcentaje,
        vencidos,

        ultimaActualizacion,
    };
}

/* =====================================================
   LISTADO GLOBAL
===================================================== */

export async function listarEmpresasLeypd() {
    const empresas =
        await prisma.empresa.findMany({
            where: {
                isActive:
                    true,
            },

            select: {
                id_empresa:
                    true,

                nombre:
                    true,

                razonSocial:
                    true,

                leypdElementos:
                    true,

                leypdFicha: {
                    select: {
                        id:
                            true,

                        datos:
                            true,

                        respondidoAt:
                            true,

                        updatedAt:
                            true,
                    },
                },
            },

            orderBy: {
                nombre:
                    "asc",
            },
        });

    const resultado =
        empresas.map(
            (empresa) => {
                const elementos =
                    combinarElementosConCatalogo(
                        empresa
                            .leypdElementos
                    );

                const resumen =
                    calcularResumenLeypd(
                        elementos
                    );

                return {
                    empresaId:
                        empresa.id_empresa,

                    empresaNombre:
                        empresa.nombre,

                    razonSocial:
                        empresa.razonSocial,

                    ...resumen,

                    ficha: {
                        existe:
                            Boolean(
                                empresa
                                    .leypdFicha
                            ),

                        respondida:
                            Boolean(
                                empresa
                                    .leypdFicha
                                    ?.respondidoAt
                            ),

                        respondidoAt:
                            empresa
                                .leypdFicha
                                ?.respondidoAt ??
                            null,

                        updatedAt:
                            empresa
                                .leypdFicha
                                ?.updatedAt ??
                            null,
                    },
                };
            }
        );

    return {
        resumen: {
            totalEmpresas:
                resultado.length,

            clientesCompletos:
                resultado.filter(
                    (empresa) =>
                        empresa.porcentaje ===
                        100
                ).length,

            clientesSinIniciar:
                resultado.filter(
                    (empresa) =>
                        empresa.sinIniciar ===
                        TOTAL_ELEMENTOS_LEYPD
                ).length,

            compromisosVencidos:
                resultado.reduce(
                    (
                        total,
                        empresa
                    ) =>
                        total +
                        empresa.vencidos,
                    0
                ),

            elementosImplementados:
                resultado.reduce(
                    (
                        total,
                        empresa
                    ) =>
                        total +
                        empresa.implementados,
                    0
                ),
        },

        empresas:
            resultado,
    };
}

/* =====================================================
   DETALLE EMPRESA
===================================================== */

export async function obtenerDetalleLeypdEmpresa(
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

                isActive:
                    true,

                leypdElementos:
                    true,
            },
        });

    if (!empresa) {
        throw new Error(
            "EMPRESA_NO_ENCONTRADA"
        );
    }

    const elementos =
        combinarElementosConCatalogo(
            empresa.leypdElementos
        );

    const resumen =
        calcularResumenLeypd(
            elementos
        );

    return {
        empresa: {
            id_empresa:
                empresa.id_empresa,

            nombre:
                empresa.nombre,

            razonSocial:
                empresa.razonSocial,

            isActive:
                empresa.isActive,
        },

        resumen,
        elementos,
    };
}

/* =====================================================
   ACTUALIZAR ELEMENTO
===================================================== */

export async function actualizarElementoLeypd(
    empresaId: number,
    numero: number,
    input: ActualizarElementoLeypdInput
) {
    const catalogo =
        obtenerElementoCatalogo(
            numero
        );

    if (!catalogo) {
        throw new Error(
            "ELEMENTO_LEYPD_INVALIDO"
        );
    }

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

    return prisma.leypdElemento.upsert({
        where: {
            empresaId_numero: {
                empresaId,
                numero,
            },
        },

        create: {
            empresaId,
            numero,

            estado:
                input.estado,

            responsable:
                input.responsable ??
                null,

            fechaCompromiso:
                input.fechaCompromiso ??
                null,

            evidencia:
                input.evidencia ??
                null,

            observaciones:
                input.observaciones ??
                null,

            actualizadoPorId:
                input.actualizadoPorId ??
                null,
        },

        update: {
            estado:
                input.estado,

            responsable:
                input.responsable ??
                null,

            fechaCompromiso:
                input.fechaCompromiso ??
                null,

            evidencia:
                input.evidencia ??
                null,

            observaciones:
                input.observaciones ??
                null,

            actualizadoPorId:
                input.actualizadoPorId ??
                null,
        },
    });
}