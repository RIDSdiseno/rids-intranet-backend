import {
    Prisma,
} from "@prisma/client";

/*
 * =========================================================
 * QUERY COMPLETA PARA INFORME DEL FUNNEL
 * =========================================================
 *
 * Centralizamos aquí el include para:
 *
 * - mantener tipado estricto;
 * - evitar usar any;
 * - reutilizar exactamente el mismo tipo en:
 *      - service de informe
 *      - generador PDF
 */

export const oportunidadInformeInclude =
    Prisma.validator<Prisma.OportunidadVentaInclude>()({
        entidad: {
            select: {
                id:
                    true,

                nombre:
                    true,

                rut:
                    true,

                correo:
                    true,

                telefono:
                    true,

                direccion:
                    true,

                origen:
                    true,
            },
        },


        responsable: {
            select: {
                id_tecnico:
                    true,

                nombre:
                    true,

                email:
                    true,

                area:
                    true,

                cargo:
                    true,
            },
        },


        /*
         * Seguimientos / próximas tareas.
         *
         * Orden ascendente para que el PDF
         * represente el flujo cronológico.
         */
        seguimientos: {
            orderBy: {
                createdAt:
                    "asc",
            },

            include: {
                autor: {
                    select: {
                        id_tecnico:
                            true,

                        nombre:
                            true,

                        email:
                            true,
                    },
                },
            },
        },


        /*
         * Historial real de avance por el Funnel.
         *
         * Contiene:
         * - etapa anterior
         * - etapa nueva
         * - nota / motivo
         * - actor
         * - fecha
         */
        historialEtapas: {
            orderBy: {
                createdAt:
                    "asc",
            },

            include: {
                actor: {
                    select: {
                        id_tecnico:
                            true,

                        nombre:
                            true,

                        email:
                            true,
                    },
                },
            },
        },


        /*
         * Cotizaciones actualmente vinculadas.
         */
        cotizaciones: {
            orderBy: {
                createdAt:
                    "asc",
            },

            include: {
                entidad: {
                    select: {
                        id:
                            true,

                        nombre:
                            true,

                        rut:
                            true,

                        correo:
                            true,
                    },
                },


                tecnico: {
                    select: {
                        id_tecnico:
                            true,

                        nombre:
                            true,

                        email:
                            true,
                    },
                },


                /*
                 * Historial de envíos reales
                 * de la cotización.
                 */
                envios: {
                    orderBy: {
                        sentAt:
                            "asc",
                    },

                    select: {
                        id:
                            true,

                        to:
                            true,

                        subject:
                            true,

                        sentBy:
                            true,

                        creadoPor:
                            true,

                        fechaCreacion:
                            true,

                        sentAt:
                            true,
                    },
                },


                /*
                 * Detalle de productos/servicios
                 * incluidos en la cotización.
                 */
                items: {
                    orderBy: {
                        id:
                            "asc",
                    },

                    select: {
                        id:
                            true,

                        tipo:
                            true,

                        nombre:
                            true,

                        descripcion:
                            true,

                        cantidad:
                            true,

                        precio:
                            true,

                        precioCosto:
                            true,

                        porcGanancia:
                            true,

                        porcentaje:
                            true,
                    },
                },
            },
        },
    });


export type OportunidadInformeData =
    Prisma.OportunidadVentaGetPayload<{
        include:
        typeof oportunidadInformeInclude;
    }>;