import {
    EstadoOportunidadMercadoPublico,
    MonedaGestioo,
    Prisma,
    TipoEntidadGestioo,
} from "@prisma/client";

import {
    prisma,
} from "../../lib/prisma.js";

import {
    consultarLicitacionDetalle,
    consultarLicitacionesActivas,
    type MercadoPublicoLicitacionApi,
} from "./mercado-publico-api.service.js";

import {
    calcularScoreMercadoPublico,
} from "./mercado-publico-score.service.js";

import {
    crearOportunidad,
} from "../oportunidades.service.js";


function toDate(
    value:
        unknown
): Date | null {

    if (
        !value
    ) {
        return null;
    }


    const date =
        new Date(
            String(
                value
            )
        );


    return Number.isNaN(
        date.getTime()
    )
        ? null
        : date;
}


function toNumber(
    value:
        unknown
): number | null {

    if (
        value === null ||
        value === undefined ||
        value === ""
    ) {
        return null;
    }


    const n =
        Number(
            value
        );


    return Number.isFinite(
        n
    )
        ? n
        : null;
}


function normalizarRut(
    value:
        unknown
): string | null {

    const rut =
        String(
            value ??
            ""
        )
            .replace(
                /[^0-9kK]/g,
                ""
            )
            .toUpperCase();


    return rut ||
        null;
}

function sleep(
    ms: number
): Promise<void> {

    return new Promise(
        (
            resolve
        ) =>
            setTimeout(
                resolve,
                ms
            )
    );
}


async function enriquecerLicitacion(
    licitacion:
        MercadoPublicoLicitacionApi
): Promise<MercadoPublicoLicitacionApi> {

    const codigo =
        String(
            licitacion
                .CodigoExterno ??
            ""
        ).trim();


    if (
        !codigo
    ) {
        return licitacion;
    }


    try {

        return (
            await consultarLicitacionDetalle(
                codigo
            )
        ) ??
            licitacion;

    } catch (
    error
    ) {

        console.error(
            `[MERCADO PUBLICO] No fue posible obtener detalle ${codigo}:`,
            error
        );


        return licitacion;
    }
}


export async function sincronizarOportunidadesMercadoPublico() {

    const respuesta =
        await consultarLicitacionesActivas();


    const basicas =
        Array.isArray(
            respuesta.Listado
        )
            ? respuesta.Listado
            : [];


    let procesadas =
        0;

    let nuevas =
        0;

    let actualizadas =
        0;

    let descartadasScore =
        0;

    const MAX_DETALLES_POR_SINCRONIZACION =
        20;

    let detallesConsultados =
        0;

    let omitidasExistentes =
        0;

    let omitidasPorLimite =
        0;


    /*
     * IMPORTANTE:
     * Para V1 enriquecemos una licitación antes de
     * puntuarla, porque la búsqueda general entrega
     * información básica y la consulta por código
     * entrega el detalle.
     */
    for (
        const basica of
        basicas
    ) {

        /*
         * ==========================================
         * 1. PREFILTRO CON DATOS BÁSICOS
         * ==========================================
         *
         * Antes de consultar el detalle individual,
         * evaluamos si existe alguna afinidad TI.
         */

        const scoringPreliminar =
            calcularScoreMercadoPublico({

                nombre:
                    basica.Nombre ??
                    null,

                descripcion:
                    basica.Descripcion ??
                    null,

                items:
                    [],

                montoEstimado:
                    toNumber(
                        basica.MontoEstimado
                    ),

                fechaCierre:
                    toDate(
                        basica
                            .Fechas
                            ?.FechaCierre ??
                        basica
                            .FechaCierre
                    ),
            });


        /*
         * Si no existe ninguna coincidencia TI,
         * ni siquiera consultamos el detalle.
         */
        if (
            !scoringPreliminar
                .tieneAfinidadTecnica
        ) {

            descartadasScore++;

            continue;
        }

        const codigoBasico =
            String(
                basica
                    .CodigoExterno ??
                ""
            ).trim();


        if (
            !codigoBasico
        ) {
            continue;
        }


        const existente =
            await prisma
                .oportunidadMercadoPublico
                .findUnique({

                    where: {
                        codigoExterno:
                            codigoBasico,
                    },

                    select: {
                        id:
                            true,
                    },
                });


        if (
            existente
        ) {

            omitidasExistentes++;

            continue;
        }


        /*
         * Si ya existe en nuestra base,
         * no volvemos a consultar el detalle
         * en cada sincronización.
         */
        const existenteAntesDetalle =
            await prisma
                .oportunidadMercadoPublico
                .findUnique({

                    where: {
                        codigoExterno:
                            codigoBasico,
                    },

                    select: {
                        id:
                            true,

                        sincronizadoAt:
                            true,

                        rawJson:
                            true,
                    },
                });


        if (
            existenteAntesDetalle
        ) {

            /*
             * Ya fue enriquecida anteriormente.
             * La saltamos en esta sincronización.
             */
            continue;
        }


        /*
         * Limitar cantidad de consultas externas
         * por ejecución.
         */
        if (
            detallesConsultados >=
            MAX_DETALLES_POR_SINCRONIZACION
        ) {
            continue;
        }

        if (
            detallesConsultados >=
            MAX_DETALLES_POR_SINCRONIZACION
        ) {

            omitidasPorLimite++;

            continue;
        }


        detallesConsultados++;

        /*
         * ==========================================
         * 2. ENRIQUECER SOLO CANDIDATAS
         * ==========================================
         */

        const detalle =
            await enriquecerLicitacion(
                basica
            );


        /*
         * Pequeña pausa para evitar saturar
         * la API de Mercado Público.
         */
        await sleep(
            1200
        );


        const codigo =
            String(
                detalle
                    .CodigoExterno ??
                ""
            ).trim();


        if (
            !codigo
        ) {
            continue;
        }


        // ... continúa tu lógica actual
    }


    return {
        totalApi:
            basicas.length,

        procesadas,

        nuevas,

        actualizadas,

        descartadasScore,

        detallesConsultados,

        omitidasExistentes,

        omitidasPorLimite,
    };
}

export type FiltrosMercadoPublico = {

    texto?:
    string;

    estado?:
    EstadoOportunidadMercadoPublico;

    scoreMin?:
    number;

    region?:
    string;

    page?:
    number;

    limit?:
    number;
};


export async function listarOportunidadesMercadoPublico(
    filtros:
        FiltrosMercadoPublico
) {

    const page =
        filtros.page ??
        1;

    const limit =
        Math.min(
            filtros.limit ??
            30,
            100
        );


    const where:
        Prisma.OportunidadMercadoPublicoWhereInput =
        {};


    if (
        filtros.estado
    ) {

        where.estado =
            filtros.estado;

    } else {

        where.estado = {
            not:
                EstadoOportunidadMercadoPublico
                    .DESCARTADA,
        };
    }


    if (
        filtros.scoreMin !==
        undefined
    ) {

        where.score = {
            gte:
                filtros
                    .scoreMin,
        };
    }


    if (
        filtros.region
    ) {

        where.unidadRegion = {
            contains:
                filtros.region,

            mode:
                "insensitive",
        };
    }


    if (
        filtros.texto
    ) {

        where.OR = [

            {
                nombre: {
                    contains:
                        filtros.texto,

                    mode:
                        "insensitive",
                },
            },

            {
                descripcion: {
                    contains:
                        filtros.texto,

                    mode:
                        "insensitive",
                },
            },

            {
                codigoExterno: {
                    contains:
                        filtros.texto,

                    mode:
                        "insensitive",
                },
            },

            {
                organismoNombre: {
                    contains:
                        filtros.texto,

                    mode:
                        "insensitive",
                },
            },

        ];
    }


    const [
        total,
        data,
    ] =
        await Promise.all([

            prisma
                .oportunidadMercadoPublico
                .count({
                    where,
                }),

            prisma
                .oportunidadMercadoPublico
                .findMany({

                    where,

                    orderBy: [
                        {
                            score:
                                "desc",
                        },
                        {
                            fechaCierre:
                                "asc",
                        },
                    ],

                    skip:
                        (
                            page -
                            1
                        ) *
                        limit,

                    take:
                        limit,

                    include: {

                        oportunidadVenta: {
                            select: {
                                id:
                                    true,

                                codigo:
                                    true,

                                etapa:
                                    true,

                                titulo:
                                    true,
                            },
                        },

                        entidad: {
                            select: {
                                id:
                                    true,

                                nombre:
                                    true,

                                rut:
                                    true,
                            },
                        },
                    },
                }),

        ]);


    return {

        data,

        meta: {
            page,
            limit,
            total,

            pages:
                Math.max(
                    1,
                    Math.ceil(
                        total /
                        limit
                    )
                ),
        },
    };
}

export async function cambiarEstadoMercadoPublico(
    id:
        number,
    estado:
        EstadoOportunidadMercadoPublico
) {

    return prisma
        .oportunidadMercadoPublico
        .update({

            where: {
                id,
            },

            data: {
                estado,
            },
        });
}

export async function convertirMercadoPublicoAFunnel(
    id:
        number,
    actorId:
        number
) {

    const oportunidadMP =
        await prisma
            .oportunidadMercadoPublico
            .findUnique({

                where: {
                    id,
                },
            });


    if (
        !oportunidadMP
    ) {

        throw new Error(
            "Oportunidad de Mercado Público no encontrada."
        );
    }


    if (
        oportunidadMP
            .oportunidadVentaId
    ) {

        throw new Error(
            "La oportunidad ya fue convertida al funnel."
        );
    }


    /*
     * 1. Buscar/reutilizar EntidadGestioo por RUT.
     */
    let entidad =
        oportunidadMP
            .organismoRut
            ? await prisma
                .entidadGestioo
                .findUnique({

                    where: {
                        rut:
                            oportunidadMP
                                .organismoRut,
                    },
                })
            : null;


    /*
     * 2. Si no existe, crear prospecto/entidad.
     *
     * No se crea Empresa todavía.
     * Empresa es cliente operativo del CRM.
     */
    if (
        !entidad
    ) {

        entidad =
            await prisma
                .entidadGestioo
                .create({

                    data: {

                        nombre:
                            oportunidadMP
                                .organismoNombre,

                        rut:
                            oportunidadMP
                                .organismoRut,

                        correo:
                            oportunidadMP
                                .contactoEmail,

                        telefono:
                            oportunidadMP
                                .contactoTelefono,

                        direccion:
                            oportunidadMP
                                .unidadDireccion,

                        tipo:
                            TipoEntidadGestioo
                                .EMPRESA,

                        /*
                         * Tu enum actual no contiene
                         * MERCADO_PUBLICO.
                         */
                        origen:
                            "OTRO",
                    },
                });
    }


    /*
     * 3. Crear oportunidad usando exactamente
     *    el flujo actual del Funnel.
     */
    const oportunidad =
        await crearOportunidad(
            actorId,
            {

                titulo:
                    oportunidadMP
                        .nombre,

                responsableId:
                    actorId,

                entidadId:
                    entidad.id,

                proyecto:
                    oportunidadMP
                        .codigoExterno,

                contactoNombre:
                    oportunidadMP
                        .contactoNombre,

                contactoEmail:
                    oportunidadMP
                        .contactoEmail,

                contactoTelefono:
                    oportunidadMP
                        .contactoTelefono,

                prioridad:
                    oportunidadMP
                        .score >=
                        85
                        ? "URGENTE"
                        : oportunidadMP
                            .score >=
                            65
                            ? "ALTA"
                            : "MEDIA",

                montoEstimado:
                    oportunidadMP
                        .montoEstimado
                        ? Number(
                            oportunidadMP
                                .montoEstimado
                        )
                        : null,

                moneda:
                    MonedaGestioo
                        .CLP,

                probabilidadCierre:
                    oportunidadMP
                        .score,

                fechaProbableCierre:
                    oportunidadMP
                        .fechaCierre,

                proximaAccion:
                    "Revisar licitación y evaluar participación",

                fechaProximaAccion:
                    oportunidadMP
                        .fechaCierre,

                observaciones:
                    [
                        `Origen: Mercado Público`,
                        `Código: ${oportunidadMP.codigoExterno}`,
                        `Organismo: ${oportunidadMP.organismoNombre}`,
                        oportunidadMP
                            .unidadNombre
                            ? `Unidad: ${oportunidadMP.unidadNombre}`
                            : null,
                        oportunidadMP
                            .unidadRegion
                            ? `Región: ${oportunidadMP.unidadRegion}`
                            : null,
                        `Afinidad: ${oportunidadMP.score}/100`,
                        oportunidadMP
                            .descripcion,
                    ]
                        .filter(
                            Boolean
                        )
                        .join(
                            "\n"
                        ),
            }
        );


    /*
     * 4. Marcar origen como convertido.
     */
    await prisma
        .oportunidadMercadoPublico
        .update({

            where: {
                id,
            },

            data: {

                estado:
                    EstadoOportunidadMercadoPublico
                        .CONVERTIDA,

                entidadId:
                    entidad.id,

                oportunidadVentaId:
                    oportunidad.id,

                convertidoPorId:
                    actorId,

                convertidoAt:
                    new Date(),
            },
        });


    return {
        oportunidadMercadoPublicoId:
            id,

        entidad,

        oportunidad,
    };
}