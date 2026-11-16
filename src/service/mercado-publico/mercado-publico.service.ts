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
} from "../oportunidades/oportunidades.service.js";

import {
    fechaChile,
} from "../../utils/fecha-chile.js";

import {
    sincronizarHitosLicitacion,
    whereVigenciaLicitacion,
    type VigenciaMercadoPublico,
} from "./mercado-publico-hitos.service.js";


/*
 * Mercado Público entrega fechas en hora de Chile sin zona.
 * new Date() las corría 3-4 h en Railway (UTC).
 */
function toDate(
    value:
        unknown
): Date | null {

    return fechaChile(
        value
    );
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

function textoONull(
    value:
        unknown
): string | null {

    if (
        typeof value !==
        "string"
    ) {
        return null;
    }


    const texto =
        value.trim();


    return texto ||
        null;
}


/** Copia JSON-serializable del detalle para guardarlo en rawJson. */
function aJson(
    value:
        unknown
): Prisma.InputJsonValue {

    return JSON.parse(
        JSON.stringify(
            value
        )
    ) as Prisma.InputJsonValue;
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


    /*
 * Si Mercado Público no entrega un Listado (ticket inválido,
 * límite diario, peticiones simultáneas…), se informa el error
 * en vez de terminar en silencio con totalApi 0.
 * Solo se muestra Codigo/Mensaje de la API: la URL lleva el ticket.
 */
    if (
        !Array.isArray(
            respuesta.Listado
        )
    ) {

        const r =
            respuesta as Record<string, unknown>;


        throw new Error(
            `Mercado Público no devolvió licitaciones` +
            (
                r.Codigo !== undefined
                    ? ` (código ${String(r.Codigo)})`
                    : ""
            ) +
            `: ${typeof r.Mensaje === "string"
                ? r.Mensaje
                : `claves recibidas: ${Object.keys(r).join(", ") || "ninguna"}`}`
        );
    }


    console.log(
        `[MERCADO PUBLICO] Activas: Cantidad=${String(respuesta.Cantidad ?? "?")} Listado=${respuesta.Listado.length}`
    );


    const basicas =
        respuesta.Listado;


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


        /*
  * Ya existe en nuestra base: no se vuelve a consultar aquí.
  * Las INTERESANTE/CONVERTIDA se refrescan con la
  * sincronización de hitos (mercado-publico-hitos.service.ts).
  */
        if (
            existente
        ) {

            omitidasExistentes++;

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


        /*
         * ==========================================
         * 3. SCORE FINAL CON EL DETALLE (incluye ítems)
         * ==========================================
         */

        const items =
            (
                detalle
                    .Items
                    ?.Listado ??
                []
            ).map(
                (
                    item
                ) => ({

                    nombre:
                        textoONull(
                            item.NombreProducto
                        ),

                    descripcion:
                        textoONull(
                            item.Descripcion
                        ),

                    categoria:
                        textoONull(
                            item.Categoria
                        ),
                })
            );


        const montoEstimado =
            toNumber(
                detalle.MontoEstimado
            );


        const fechaCierre =
            toDate(
                detalle
                    .Fechas
                    ?.FechaCierre ??
                detalle
                    .FechaCierre
            );


        const scoring =
            calcularScoreMercadoPublico({

                nombre:
                    textoONull(
                        detalle.Nombre
                    ),

                descripcion:
                    textoONull(
                        detalle.Descripcion
                    ),

                items,

                montoEstimado,

                fechaCierre,
            });


        if (
            !scoring
                .tieneAfinidadTecnica
        ) {

            descartadasScore++;

            continue;
        }


        /*
         * ==========================================
         * 4. GUARDAR
         * ==========================================
         *
         * No se toca `estado` al actualizar: es decisión del usuario.
         * El contacto del contrato tiene prioridad sobre el usuario
         * comprador (el cargo solo se conoce para este último).
         */

        const comprador =
            detalle.Comprador;


        const contactoContrato =
            textoONull(
                detalle.NombreResponsableContrato
            );


        const datos:
            Omit<
                Prisma.OportunidadMercadoPublicoUncheckedCreateInput,
                "codigoExterno"
            > = {

            nombre:
                textoONull(
                    detalle.Nombre
                ) ??
                codigo,

            descripcion:
                textoONull(
                    detalle.Descripcion
                ),

            codigoEstado:
                typeof detalle.CodigoEstado ===
                    "number"
                    ? detalle.CodigoEstado
                    : null,

            estadoMercadoPublico:
                textoONull(
                    detalle.Estado
                ),

            tipoLicitacion:
                textoONull(
                    detalle.Tipo
                ),

            fechaPublicacion:
                toDate(
                    detalle
                        .Fechas
                        ?.FechaPublicacion
                ),

            fechaCierre,

            moneda:
                textoONull(
                    detalle.Moneda
                ),

            montoEstimado,

            organismoCodigo:
                textoONull(
                    comprador?.CodigoOrganismo
                ),

            organismoNombre:
                textoONull(
                    comprador?.NombreOrganismo
                ) ??
                "Sin organismo",

            organismoRut:
                normalizarRut(
                    comprador?.RutUnidad
                ),

            unidadCodigo:
                textoONull(
                    comprador?.CodigoUnidad
                ),

            unidadNombre:
                textoONull(
                    comprador?.NombreUnidad
                ),

            unidadDireccion:
                textoONull(
                    comprador?.DireccionUnidad
                ),

            unidadComuna:
                textoONull(
                    comprador?.ComunaUnidad
                ),

            unidadRegion:
                textoONull(
                    comprador?.RegionUnidad
                ),

            contactoNombre:
                contactoContrato ??
                textoONull(
                    comprador?.NombreUsuario
                ),

            contactoCargo:
                contactoContrato
                    ? null
                    : textoONull(
                        comprador?.CargoUsuario
                    ),

            contactoEmail:
                textoONull(
                    detalle.EmailResponsableContrato
                ),

            contactoTelefono:
                textoONull(
                    detalle.FonoResponsableContrato
                ),

            score:
                scoring.score,

            nivelAfinidad:
                scoring.nivel,

            coincidencias:
                scoring.coincidencias,

            rawJson:
                aJson(
                    detalle
                ),

            sincronizadoAt:
                new Date(),
        };


        try {

            /*
             * El código del detalle puede diferir del básico
             * (raro): se vuelve a revisar antes de guardar.
             */
            const previa =
                await prisma
                    .oportunidadMercadoPublico
                    .findUnique({

                        where: {
                            codigoExterno:
                                codigo,
                        },

                        select: {
                            id:
                                true,
                        },
                    });


            const guardada =
                await prisma
                    .oportunidadMercadoPublico
                    .upsert({

                        where: {
                            codigoExterno:
                                codigo,
                        },

                        create: {
                            codigoExterno:
                                codigo,

                            ...datos,
                        },

                        update:
                            datos,

                        select: {
                            id:
                                true,
                        },
                    });


            procesadas++;

            if (
                previa
            ) {
                actualizadas++;
            } else {
                nuevas++;
            }


            /*
             * Hitos con el detalle ya consultado (sin nueva llamada a la API).
             * Los avisos solo se envían para INTERESANTE/CONVERTIDA.
             */
            try {

                await sincronizarHitosLicitacion(
                    guardada.id,
                    detalle
                );

            } catch (
            error
            ) {

                console.error(
                    `[MERCADO PUBLICO] No fue posible crear hitos de ${codigo}:`,
                    error
                );
            }

        } catch (
        error
        ) {

            console.error(
                `[MERCADO PUBLICO] No fue posible guardar ${codigo}:`,
                error
            );
        }
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

    /** vigentes (por defecto) | cerradas | todas */
    vigencia?:
    VigenciaMercadoPublico;

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
    {
        AND: [
            whereVigenciaLicitacion(
                filtros.vigencia ??
                "vigentes"
            ),
        ],
    };

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

    /*
     * Refresca estado, fechas (hora de Chile) e hitos desde
     * Mercado Público antes de convertir, para que fechaCierre
     * llegue correcta a la oportunidad. Si la API falla, se
     * convierte con lo guardado.
     */
    try {

        await sincronizarHitosLicitacion(
            id
        );

    } catch (
    error
    ) {

        console.error(
            `[MERCADO PUBLICO] No fue posible refrescar hitos antes de convertir ${id}:`,
            error
        );
    }


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