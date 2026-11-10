// src/service/suscripciones-contratos/suscripciones-vencimientos.service.ts

/* =========================================================
   RESUMEN DE VENCIMIENTOS POR EMPRESA (listado de empresas)

   Mismo criterio de fechas que los avisos por correo
   (suscripciones-avisos.service.ts):
     - fechaRenovacion y fechaTermino se evalúan por separado
     - vencida  = fecha anterior a hoy (Chile)
     - porVencer = hoy .. hoy + mayor umbral (30 días)

   Diferencia: cuenta TODAS las suscripciones activas, tengan o
   no "Avisar vencimiento" (eso solo controla los correos).

   Una sola consulta para todas las empresas.
   ========================================================= */

import {
    prisma,
} from "../../lib/prisma.js";

import {
    hoyChile,
    umbralesAviso,
} from "./suscripciones-avisos.service.js";

const DIA_MS =
    86_400_000;

/** Máximo de ítems por empresa que viajan al front (para el tooltip). */
const MAX_ITEMS =
    15;

export type VencimientoSuscripcion = {
    suscripcionId: number;

    productoPlan: string;

    fabricante: string;

    tipoFecha:
    | "RENOVACION"
    | "TERMINO";

    /** YYYY-MM-DD */
    fecha: string;

    /** Días que faltan; negativo = vencida hace N días. */
    dias: number;

    avisosActivos: boolean;
};

export type ResumenVencimientosEmpresa = {
    vencidas: number;

    porVencer: number;

    /** Por vencer más próxima (dias >= 0), o null. */
    proxima: VencimientoSuscripcion | null;

    /** Vencidas (más atrasada primero) y luego por vencer (más próxima primero). */
    items: VencimientoSuscripcion[];
};

function msDia(
    clave: string,
): number {
    return Date.parse(
        `${clave}T00:00:00.000Z`,
    );
}

export async function resumenVencimientosEmpresas(
    empresaIds: number[],
): Promise<
    Map<
        number,
        ResumenVencimientosEmpresa
    >
> {

    const resultado =
        new Map<
            number,
            ResumenVencimientosEmpresa
        >();

    const ids =
        [
            ...new Set(
                empresaIds.filter(
                    (id) =>
                        Number.isInteger(
                            id,
                        ) &&
                        id > 0,
                ),
            ),
        ];

    if (
        ids.length ===
        0
    ) {
        return resultado;
    }

    const umbrales =
        umbralesAviso();

    const ventana =
        umbrales[umbrales.length - 1] ??
        30;

    const msHoy =
        msDia(
            hoyChile(),
        );

    const hasta = {
        lt:
            new Date(
                msHoy +
                (ventana + 1) *
                DIA_MS,
            ),
    };

    const suscripciones =
        await prisma
            .suscripcionContrato
            .findMany({
                where: {
                    empresaId: {
                        in:
                            ids,
                    },

                    activo:
                        true,

                    OR: [
                        {
                            fechaRenovacion:
                                hasta,
                        },
                        {
                            fechaTermino:
                                hasta,
                        },
                    ],
                },

                select: {
                    id: true,
                    empresaId: true,
                    productoPlan: true,
                    fabricante: true,
                    fechaRenovacion: true,
                    fechaTermino: true,
                    avisosActivos: true,
                },
            });

    const porEmpresa =
        new Map<
            number,
            VencimientoSuscripcion[]
        >();

    for (
        const s
        of suscripciones
    ) {
        const fechas = [
            [
                "RENOVACION",
                s.fechaRenovacion,
            ],
            [
                "TERMINO",
                s.fechaTermino,
            ],
        ] as const;

        for (
            const [
                tipoFecha,
                fecha,
            ]
            of fechas
        ) {
            if (
                !fecha
            ) {
                continue;
            }

            const clave =
                fecha
                    .toISOString()
                    .slice(
                        0,
                        10,
                    );

            const dias =
                Math.round(
                    (
                        msDia(
                            clave,
                        ) -
                        msHoy
                    ) /
                    DIA_MS,
                );

            if (
                dias >
                ventana
            ) {
                continue;
            }

            const lista =
                porEmpresa.get(
                    s.empresaId,
                ) ??
                [];

            lista.push({
                suscripcionId:
                    s.id,

                productoPlan:
                    s.productoPlan,

                fabricante:
                    s.fabricante,

                tipoFecha,

                fecha:
                    clave,

                dias,

                avisosActivos:
                    s.avisosActivos,
            });

            porEmpresa.set(
                s.empresaId,
                lista,
            );
        }
    }

    for (
        const [
            empresaId,
            lista,
        ]
        of porEmpresa
    ) {
        lista.sort(
            (a, b) =>
                a.dias -
                b.dias,
        );

        const vencidas =
            lista.filter(
                (v) =>
                    v.dias <
                    0,
            ).length;

        resultado.set(
            empresaId,
            {
                vencidas,

                porVencer:
                    lista.length -
                    vencidas,

                proxima:
                    lista.find(
                        (v) =>
                            v.dias >=
                            0,
                    ) ??
                    null,

                items:
                    lista.slice(
                        0,
                        MAX_ITEMS,
                    ),
            },
        );
    }

    return resultado;
}

/* =========================================================
   VENCIMIENTOS DE TODAS LAS EMPRESAS (campana de recordatorios)

   Mismo criterio que el resumen por empresa: vencidas (sin
   límite hacia atrás) y por vencer hasta el mayor umbral.
   Agrupado por suscripción: una tarjeta con sus dos fechas.
   ========================================================= */

export type VencimientoSuscripcionCampana = {
    suscripcionId: number;

    empresaId: number;

    empresaNombre: string;

    productoPlan: string;

    fabricante: string;

    avisosActivos: boolean;

    /** Fecha más urgente: negativo = vencida hace N días. */
    dias: number;

    /** Renovación y/o término dentro de la ventana, más urgente primero. */
    fechas: {
        tipoFecha:
        | "RENOVACION"
        | "TERMINO";

        /** YYYY-MM-DD */
        fecha: string;

        dias: number;
    }[];
};

/** Máximo de suscripciones que viajan a la campana. */
const MAX_SUSCRIPCIONES_CAMPANA =
    100;

export async function vencimientosSuscripcionesCampana(): Promise<
    VencimientoSuscripcionCampana[]
> {

    const umbrales =
        umbralesAviso();

    const ventana =
        umbrales[umbrales.length - 1] ??
        30;

    const msHoy =
        msDia(
            hoyChile(),
        );

    const hasta = {
        lt:
            new Date(
                msHoy +
                (ventana + 1) *
                DIA_MS,
            ),
    };

    const suscripciones =
        await prisma
            .suscripcionContrato
            .findMany({
                where: {
                    activo:
                        true,

                    empresa: {
                        isActive:
                            true,
                    },

                    OR: [
                        {
                            fechaRenovacion:
                                hasta,
                        },
                        {
                            fechaTermino:
                                hasta,
                        },
                    ],
                },

                select: {
                    id: true,
                    empresaId: true,
                    productoPlan: true,
                    fabricante: true,
                    fechaRenovacion: true,
                    fechaTermino: true,
                    avisosActivos: true,
                    empresa: {
                        select: {
                            nombre: true,
                        },
                    },
                },
            });

    const resultado: VencimientoSuscripcionCampana[] =
        [];

    for (
        const s
        of suscripciones
    ) {
        const fechas: VencimientoSuscripcionCampana["fechas"] =
            [];

        const candidatas = [
            [
                "RENOVACION",
                s.fechaRenovacion,
            ],
            [
                "TERMINO",
                s.fechaTermino,
            ],
        ] as const;

        for (
            const [
                tipoFecha,
                fecha,
            ]
            of candidatas
        ) {
            if (
                !fecha
            ) {
                continue;
            }

            const clave =
                fecha
                    .toISOString()
                    .slice(
                        0,
                        10,
                    );

            const dias =
                Math.round(
                    (
                        msDia(
                            clave,
                        ) -
                        msHoy
                    ) /
                    DIA_MS,
                );

            if (
                dias >
                ventana
            ) {
                continue;
            }

            fechas.push({
                tipoFecha,
                fecha:
                    clave,
                dias,
            });
        }

        const [
            masUrgente,
        ] =
            fechas.sort(
                (a, b) =>
                    a.dias -
                    b.dias,
            );

        if (
            !masUrgente
        ) {
            continue;
        }

        resultado.push({
            suscripcionId:
                s.id,

            empresaId:
                s.empresaId,

            empresaNombre:
                s.empresa.nombre,

            productoPlan:
                s.productoPlan,

            fabricante:
                s.fabricante,

            avisosActivos:
                s.avisosActivos,

            dias:
                masUrgente.dias,

            fechas,
        });
    }

    return resultado
        .sort(
            (a, b) =>
                a.dias -
                b.dias,
        )
        .slice(
            0,
            MAX_SUSCRIPCIONES_CAMPANA,
        );
}