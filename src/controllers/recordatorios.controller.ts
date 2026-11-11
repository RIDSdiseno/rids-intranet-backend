// src/controllers/recordatorios.controller.ts

import type { Request, Response } from "express";

import {
    AreaGestioo,
    EstadoCotizacionGestioo,
    EstadoRecordatorio,
    EstadoVisita,
    OrigenRecordatorio,
    Prisma,
    TicketStatus,
} from "@prisma/client";

import { prismaBase as prisma } from "../lib/prisma.js";

import {
    vencimientosSuscripcionesCampana,
} from "../service/suscripciones-contratos/suscripciones-vencimientos.service.js";

const DIAS_EXPIRACION_RECORDATORIO =
    3;

/* =====================================================
   HELPERS
===================================================== */

/**
 * Convierte un valor a entero positivo.
 * Devuelve null cuando el valor no es válido.
 */
function parsePositiveInt(value: unknown): number | null {
    const parsed = Number(value);

    return Number.isInteger(parsed) && parsed > 0
        ? parsed
        : null;
}

/**
 * Normaliza un texto eliminando espacios repetidos.
 */
function normalizeText(value: unknown): string {
    return String(value ?? "")
        .trim()
        .replace(/\s+/g, " ");
}

/**
 * Convierte una fecha recibida desde el frontend.
 */
function parseDateTime(value: unknown): Date | null {
    if (
        typeof value !== "string" ||
        !value.trim()
    ) {
        return null;
    }

    const date = new Date(value.trim());

    return Number.isNaN(date.getTime())
        ? null
        : date;
}

/**
 * Obtiene el ID del técnico autenticado.
 *
 * Ajusta estas propiedades si tu middleware auth
 * utiliza un nombre distinto dentro de req.
 */
function getTecnicoIdAutenticado(
    req: Request
): number | null {
    const authRequest = req as Request & {
        user?: {
            id?: number;
            id_tecnico?: number;
            tecnicoId?: number;
            userId?: number;
        };
    };

    return parsePositiveInt(
        authRequest.user?.id_tecnico ??
        authRequest.user?.tecnicoId ??
        authRequest.user?.userId ??
        authRequest.user?.id
    );
}

/**
 * Comprueba que el origen recibido pertenezca al enum.
 */
function normalizeOrigen(
    value: unknown
): OrigenRecordatorio {
    if (
        typeof value === "string" &&
        Object.values(OrigenRecordatorio).includes(
            value as OrigenRecordatorio
        )
    ) {
        return value as OrigenRecordatorio;
    }

    return OrigenRecordatorio.MANUAL;
}

/**
 * Devuelve solamente los IDs válidos.
 */
function optionalId(value: unknown): number | null {
    return parsePositiveInt(value);
}

/**
 * Verifica que se haya enviado como máximo una relación.
 */
function contarRelacionesValidas(values: unknown[]) {
    return values.filter(
        (value) => optionalId(value) !== null
    ).length;
}

/* =====================================================
   EXPIRAR RECORDATORIOS PENDIENTES ANTIGUOS
===================================================== */

async function expirarRecordatoriosPendientes(
    tecnicoId: number
): Promise<number> {
    const ahora =
        new Date();

    /*
     * Todo recordatorio cuya fecha programada
     * haya ocurrido hace más de 3 días se considera
     * expirado si todavía sigue PENDIENTE.
     */
    const fechaLimite =
        new Date(
            ahora.getTime() -
            DIAS_EXPIRACION_RECORDATORIO *
            24 *
            60 *
            60 *
            1000
        );

    /*
     * Primero obtenemos los recordatorios porque
     * necesitamos conocer las bitácoras asociadas
     * para mantenerlas sincronizadas.
     */
    const recordatoriosExpirados =
        await prisma.recordatorio.findMany({
            where: {
                destinatarioId:
                    tecnicoId,

                estado:
                    EstadoRecordatorio.PENDIENTE,

                fechaProgramada: {
                    lt:
                        fechaLimite,
                },
            },

            select: {
                id:
                    true,

                bitacoraId:
                    true,
            },
        });

    if (
        recordatoriosExpirados.length ===
        0
    ) {
        return 0;
    }

    const recordatorioIds =
        recordatoriosExpirados.map(
            (
                recordatorio
            ) =>
                recordatorio.id
        );

    const bitacoraIds =
        Array.from(
            new Set(
                recordatoriosExpirados
                    .map(
                        (
                            recordatorio
                        ) =>
                            recordatorio.bitacoraId
                    )
                    .filter(
                        (
                            id
                        ): id is number =>
                            typeof id ===
                            "number"
                    )
            )
        );

    await prisma.$transaction(
        async (
            tx
        ) => {
            /*
             * No borramos físicamente:
             * lo dejamos como CANCELADO.
             */
            await tx.recordatorio.updateMany({
                where: {
                    id: {
                        in:
                            recordatorioIds,
                    },

                    destinatarioId:
                        tecnicoId,

                    estado:
                        EstadoRecordatorio.PENDIENTE,

                    fechaProgramada: {
                        lt:
                            fechaLimite,
                    },
                },

                data: {
                    estado:
                        EstadoRecordatorio.CANCELADO,

                    canceladoAt:
                        ahora,

                    leidoAt:
                        ahora,

                    completadoAt:
                        null,

                    notificadoAt:
                        null,
                },
            });

            /*
             * Si alguno proviene de Bitácora,
             * limpiamos también los campos antiguos
             * para no dejar datos inconsistentes.
             */
            if (
                bitacoraIds.length >
                0
            ) {
                await tx.bitacoraTecnico.updateMany({
                    where: {
                        id: {
                            in:
                                bitacoraIds,
                        },
                    },

                    data: {
                        recordatorioAt:
                            null,

                        recordatorioCompletado:
                            false,

                        recordatorioCompletadoAt:
                            null,

                        recordatorioNotificadoAt:
                            null,
                    },
                });
            }
        }
    );

    return recordatoriosExpirados.length;
}

/* =====================================================
   ÓRDENES DE TALLER PENDIENTES (CALCULADO EN VIVO)
===================================================== */

/** Roles internos que ven las órdenes de taller en la campana. */
const ROLES_TALLER_CAMPANA = new Set([
    "ADMIN",
    "ADMINISTRACION",
    "TECNICO",
    "VENTAS",
]);

/**
 * Estados que cierran una orden.
 * DetalleTrabajoGestioo.estado es texto libre: se compara sin mayúsculas.
 */
const ESTADOS_TALLER_CERRADOS = [
    "COMPLETADA",
    "COMPLETADO",
    "FINALIZADA",
    "FINALIZADO",
    "CANCELADA",
    "CANCELADO",
];

const MAX_ORDENES_TALLER_CAMPANA = 50;

/**
 * Órdenes abiertas = ENTRADA (una fila por orden) que aún no
 * tiene salida. Al registrar la SALIDA, la ENTRADA pasa a COMPLETADA.
 */
export async function obtenerOrdenesTallerPendientes(
    rol: string | null | undefined
) {
    if (!rol || !ROLES_TALLER_CAMPANA.has(rol)) {
        return [];
    }

    const where: Prisma.DetalleTrabajoGestiooWhereInput = {
        area: AreaGestioo.ENTRADA,

        OR: [
            { estado: null },
            {
                NOT: ESTADOS_TALLER_CERRADOS.map(
                    (estado) => ({
                        estado: {
                            equals: estado,
                            mode: Prisma.QueryMode.insensitive,
                        },
                    })
                ),
            },
        ],
    };

    return prisma.detalleTrabajoGestioo.findMany({
        where,

        orderBy: [
            { fechaIngreso: "asc" },
            { fecha: "asc" },
        ],

        take: MAX_ORDENES_TALLER_CAMPANA,

        select: {
            id: true,
            numeroOrden: true,
            fecha: true,
            fechaIngreso: true,
            tipoTrabajo: true,
            descripcion: true,
            estado: true,
            prioridad: true,
            tecnicoId: true,
            tecnico: {
                select: { nombre: true },
            },
            entidad: {
                select: { nombre: true },
            },
            equipo: {
                select: {
                    marca: true,
                    modelo: true,
                    serial: true,
                },
            },
        },
    });
}

/* =====================================================
   CANCELAR RECORDATORIOS DE TICKETS QUE YA NO APORTAN
===================================================== */

/**
 * Estados de ticket que ya no requieren aviso.
 * Quita RESOLVED si quieres seguir viendo los resueltos.
 */
const ESTADOS_TICKET_SIN_AVISO: TicketStatus[] = [
    TicketStatus.RESOLVED,
    TicketStatus.CLOSED,
];

/**
 * Cancela (no borra) los recordatorios pendientes del técnico
 * cuyo ticket ya no requiere atención:
 * - RESOLVED o CLOSED;
 * - eliminado (deletedAt);
 * - inexistente (relationMode = "prisma" no garantiza integridad).
 *
 * Se ejecuta al cargar la campana, igual que la expiración de 3 días.
 */
async function cancelarRecordatoriosTicketsCerrados(
    tecnicoId: number
): Promise<number> {
    const pendientes =
        await prisma.recordatorio.findMany({
            where: {
                destinatarioId:
                    tecnicoId,

                estado:
                    EstadoRecordatorio.PENDIENTE,

                origen:
                    OrigenRecordatorio.TICKET,

                ticketId: {
                    not: null,
                },
            },

            select: {
                id: true,
                ticketId: true,
            },
        });

    if (
        pendientes.length ===
        0
    ) {
        return 0;
    }

    const ticketIds =
        Array.from(
            new Set(
                pendientes
                    .map(
                        (recordatorio) =>
                            recordatorio.ticketId
                    )
                    .filter(
                        (
                            id
                        ): id is number =>
                            typeof id ===
                            "number"
                    )
            )
        );

    /* Tickets que SÍ siguen necesitando atención */
    const vigentes =
        await prisma.ticket.findMany({
            where: {
                id: {
                    in:
                        ticketIds,
                },

                deletedAt:
                    null,

                status: {
                    notIn:
                        ESTADOS_TICKET_SIN_AVISO,
                },
            },

            select: {
                id: true,
            },
        });

    const idsVigentes =
        new Set(
            vigentes.map(
                (ticket) =>
                    ticket.id
            )
        );

    const recordatorioIds =
        pendientes
            .filter(
                (recordatorio) =>
                    recordatorio.ticketId !==
                    null &&
                    !idsVigentes.has(
                        recordatorio.ticketId
                    )
            )
            .map(
                (recordatorio) =>
                    recordatorio.id
            );

    if (
        recordatorioIds.length ===
        0
    ) {
        return 0;
    }

    const ahora =
        new Date();

    const resultado =
        await prisma.recordatorio.updateMany({
            where: {
                id: {
                    in:
                        recordatorioIds,
                },

                estado:
                    EstadoRecordatorio.PENDIENTE,
            },

            data: {
                estado:
                    EstadoRecordatorio.CANCELADO,

                canceladoAt:
                    ahora,

                leidoAt:
                    ahora,

                completadoAt:
                    null,
            },
        });

    return resultado.count;
}

/* =====================================================
   VISITAS PENDIENTES VENCIDAS (CALCULADO EN VIVO)
===================================================== */

/** Horas en PENDIENTE (desde el inicio de la visita) para considerarla vencida. */
const HORAS_VISITA_VENCIDA = 24;

const MAX_VISITAS_VENCIDAS_CAMPANA = 50;

/** Ven las visitas vencidas de todos los técnicos; el resto de los roles internos, solo las propias. */
const ROLES_VISITAS_TODAS = new Set([
    "ADMIN",
    "ADMINISTRACION",
]);

type VisitaVencidaCampana = {
    /** técnico|empresa|fecha: una jornada (el modo lote crea una visita por solicitante). */
    clave: string;
    empresaId: number;
    empresaNombre: string;
    tecnicoId: number;
    tecnicoNombre: string;
    /** YYYY-MM-DD en Chile */
    fecha: string;
    inicio: Date;
    /** Días desde el inicio (1 o más). */
    dias: number;
    visitaIds: number[];
    solicitantes: string[];
};

function fechaChile(
    fecha: Date
): string {
    return new Intl.DateTimeFormat("en-CA", {
        timeZone: "America/Santiago",
    }).format(fecha);
}

/**
 * Visitas que siguen PENDIENTE más de 24 horas después de su inicio,
 * agrupadas por jornada (técnico + empresa + día).
 */
export async function obtenerVisitasVencidas(
    rol: string | null | undefined,
    tecnicoId: number
): Promise<VisitaVencidaCampana[]> {
    if (!rol || !ROLES_TALLER_CAMPANA.has(rol)) {
        return [];
    }

    const ahora =
        new Date();

    const limite =
        new Date(
            ahora.getTime() -
            HORAS_VISITA_VENCIDA *
            60 *
            60 *
            1000
        );

    const visitas =
        await prisma.visita.findMany({
            where: {
                status:
                    EstadoVisita.PENDIENTE,

                inicio: {
                    lt: limite,
                },

                empresa: {
                    is: {
                        isActive: true,
                    },
                },

                ...(ROLES_VISITAS_TODAS.has(rol)
                    ? {}
                    : { tecnicoId }),
            },

            orderBy: {
                inicio: "asc",
            },

            /* Tope de filas: varias visitas forman una sola jornada */
            take: 500,

            select: {
                id_visita: true,
                inicio: true,
                empresaId: true,
                tecnicoId: true,
                solicitante: true,
                empresa: {
                    select: { nombre: true },
                },
                tecnico: {
                    select: { nombre: true },
                },
                solicitanteRef: {
                    select: { nombre: true },
                },
            },
        });

    const jornadas =
        new Map<string, VisitaVencidaCampana>();

    for (const visita of visitas) {
        const fecha =
            fechaChile(visita.inicio);

        const clave =
            `${visita.tecnicoId}|${visita.empresaId}|${fecha}`;

        let jornada =
            jornadas.get(clave);

        if (!jornada) {
            jornada = {
                clave,
                empresaId:
                    visita.empresaId,
                empresaNombre:
                    visita.empresa.nombre,
                tecnicoId:
                    visita.tecnicoId,
                tecnicoNombre:
                    visita.tecnico.nombre,
                fecha,
                inicio:
                    visita.inicio,
                dias:
                    Math.floor(
                        (ahora.getTime() -
                            visita.inicio.getTime()) /
                        86_400_000
                    ),
                visitaIds: [],
                solicitantes: [],
            };

            jornadas.set(
                clave,
                jornada
            );
        }

        jornada.visitaIds.push(
            visita.id_visita
        );

        const nombre =
            visita.solicitanteRef?.nombre?.trim() ||
            visita.solicitante?.trim();

        if (
            nombre &&
            !jornada.solicitantes.includes(nombre)
        ) {
            jornada.solicitantes.push(nombre);
        }
    }

    /* La más antigua primero */
    return Array.from(
        jornadas.values()
    ).slice(
        0,
        MAX_VISITAS_VENCIDAS_CAMPANA
    );
}

/* =====================================================
   TICKETS ACTIVOS (CALCULADO EN VIVO)
===================================================== */

/** Estados que la campana muestra como tickets activos. */
const ESTADOS_TICKET_ACTIVOS: TicketStatus[] = [
    TicketStatus.NEW,
    TicketStatus.OPEN,
    TicketStatus.PENDING,
];

const MAX_TICKETS_CAMPANA = 100;

/**
 * Tickets NEW, OPEN y PENDING (no eliminados), visibles para todos
 * los roles internos. Primero los de mayor prioridad y, dentro de
 * cada prioridad, los más antiguos.
 *
 * Devuelve también el total real, por si supera el máximo que se envía.
 */
export async function obtenerTicketsActivos(
    rol: string | null | undefined
) {
    if (!rol || !ROLES_TALLER_CAMPANA.has(rol)) {
        return {
            tickets: [],
            total: 0,
        };
    }

    const where: Prisma.TicketWhereInput = {
        status: {
            in: ESTADOS_TICKET_ACTIVOS,
        },

        deletedAt: null,
    };

    const [
        tickets,
        total,
    ] = await Promise.all([
        prisma.ticket.findMany({
            where,

            orderBy: [
                /* El enum va de LOW a URGENT: desc = URGENT primero */
                { priority: "desc" },
                { createdAt: "asc" },
            ],

            take: MAX_TICKETS_CAMPANA,

            select: {
                id: true,
                subject: true,
                status: true,
                priority: true,
                createdAt: true,
                lastActivityAt: true,
                empresa: {
                    select: { nombre: true },
                },
                requester: {
                    select: { nombre: true },
                },
                assignee: {
                    select: { nombre: true },
                },
            },
        }),

        prisma.ticket.count({ where }),
    ]);

    return {
        tickets,
        total,
    };
}

/* =====================================================
   COTIZACIONES EN BORRADOR (CALCULADO EN VIVO)
===================================================== */

/** Días hacia atrás (por fecha de la cotización) que se consideran. */
const DIAS_COTIZACIONES_BORRADOR = 30;

const MAX_COTIZACIONES_CAMPANA = 50;

/**
 * Cotizaciones en BORRADOR con fecha de los últimos 30 días, visibles para
 * todos los roles internos. La más antigua primero (la que está por salir
 * de la ventana). Devuelve también el total real.
 */
export async function obtenerCotizacionesBorrador(
    rol: string | null | undefined
) {
    if (!rol || !ROLES_TALLER_CAMPANA.has(rol)) {
        return {
            cotizaciones: [],
            total: 0,
        };
    }

    const desde =
        new Date(
            Date.now() -
            DIAS_COTIZACIONES_BORRADOR *
            24 *
            60 *
            60 *
            1000
        );

    const where: Prisma.CotizacionGestiooWhereInput = {
        estado:
            EstadoCotizacionGestioo.BORRADOR,

        fecha: {
            gte: desde,
        },
    };

    const [
        cotizaciones,
        total,
    ] = await Promise.all([
        prisma.cotizacionGestioo.findMany({
            where,

            orderBy: {
                fecha: "asc",
            },

            take: MAX_COTIZACIONES_CAMPANA,

            select: {
                id: true,
                fecha: true,
                tipo: true,
                total: true,
                moneda: true,
                personaResponsable: true,
                entidad: {
                    select: { nombre: true },
                },
                tecnico: {
                    select: { nombre: true },
                },
            },
        }),

        prisma.cotizacionGestioo.count({ where }),
    ]);

    return {
        cotizaciones,
        total,
    };
}

/* =====================================================
   CREAR RECORDATORIO
===================================================== */

export async function crearRecordatorio(
    req: Request,
    res: Response
) {
    try {
        const creadoPorId =
            getTecnicoIdAutenticado(req);

        if (!creadoPorId) {
            return res.status(401).json({
                error:
                    "No fue posible identificar al usuario autenticado.",
            });
        }

        const {
            titulo,
            mensaje,
            fechaProgramada,
            destinatarioId,
            origen,
            bitacoraId,
            ticketId,
            cotizacionId,
            visitaId,
            equipoId,
        } = req.body;

        const tituloFinal =
            normalizeText(titulo);

        if (!tituloFinal) {
            return res.status(400).json({
                error:
                    "El título del recordatorio es obligatorio.",
            });
        }

        const fechaFinal =
            parseDateTime(fechaProgramada);

        if (!fechaFinal) {
            return res.status(400).json({
                error:
                    "La fecha del recordatorio no es válida.",
            });
        }

        if (fechaFinal.getTime() <= Date.now()) {
            return res.status(400).json({
                error:
                    "El recordatorio debe programarse para una fecha futura.",
            });
        }

        const destinatarioIdFinal =
            parsePositiveInt(destinatarioId);

        if (!destinatarioIdFinal) {
            return res.status(400).json({
                error:
                    "El destinatario es obligatorio.",
            });
        }

        const totalRelaciones =
            contarRelacionesValidas([
                bitacoraId,
                ticketId,
                cotizacionId,
                visitaId,
                equipoId,
            ]);

        if (totalRelaciones > 1) {
            return res.status(400).json({
                error:
                    "El recordatorio solo puede relacionarse con un registro principal.",
            });
        }

        const recordatorio =
            await prisma.recordatorio.create({
                data: {
                    titulo: tituloFinal,

                    mensaje:
                        normalizeText(mensaje) ||
                        null,

                    fechaProgramada:
                        fechaFinal,

                    estado:
                        EstadoRecordatorio.PENDIENTE,

                    origen:
                        normalizeOrigen(origen),

                    destinatarioId:
                        destinatarioIdFinal,

                    creadoPorId,

                    bitacoraId:
                        optionalId(bitacoraId),

                    ticketId:
                        optionalId(ticketId),

                    cotizacionId:
                        optionalId(cotizacionId),

                    visitaId:
                        optionalId(visitaId),

                    equipoId:
                        optionalId(equipoId),
                },

                include: {
                    destinatario: {
                        select: {
                            id_tecnico: true,
                            nombre: true,
                            email: true,
                        },
                    },

                    creadoPor: {
                        select: {
                            id_tecnico: true,
                            nombre: true,
                        },
                    },
                },
            });

        return res.status(201).json({
            data: recordatorio,
        });
    } catch (error) {
        console.error(
            "Error creando recordatorio:",
            error
        );

        return res.status(500).json({
            error:
                "No fue posible crear el recordatorio.",
        });
    }
}

/* =====================================================
   OBTENER RECORDATORIOS DEL USUARIO
===================================================== */

export async function obtenerMisRecordatorios(
    req: Request,
    res: Response
) {
    try {
        const tecnicoId =
            getTecnicoIdAutenticado(req);

        if (!tecnicoId) {
            return res.status(401).json({
                error:
                    "No fue posible identificar al usuario autenticado.",
            });
        }

        /*
 * Antes de devolver la campana,
 * expirar automáticamente recordatorios
 * pendientes que lleven más de 3 días vencidos.
 */
        /* Tickets cerrados, resueltos o eliminados ya no aportan */
        await cancelarRecordatoriosTicketsCerrados(
            tecnicoId
        );

        await expirarRecordatoriosPendientes(
            tecnicoId
        );

        const incluirCompletados =
            String(
                req.query.incluirCompletados ??
                ""
            ) === "true";

        const ahora =
            new Date();

        /*
         * Se muestran recordatorios vencidos y
         * recordatorios de los próximos 30 días.
         */
        const limiteFuturo =
            new Date(
                ahora.getTime() +
                30 *
                24 *
                60 *
                60 *
                1000
            );

        const where:
            Prisma.RecordatorioWhereInput = {
            destinatarioId:
                tecnicoId,

            fechaProgramada: {
                lte: limiteFuturo,
            },
        };

        if (!incluirCompletados) {
            where.estado =
                EstadoRecordatorio.PENDIENTE;
        }

        const recordatorios =
            await prisma.recordatorio.findMany({
                where,

                orderBy: [
                    {
                        fechaProgramada:
                            "asc",
                    },
                    {
                        createdAt:
                            "desc",
                    },
                ],

                include: {
                    bitacora: {
                        select: {
                            id: true,
                            titulo: true,
                            descripcion: true,
                        },
                    },

                    ticket: {
                        select: {
                            id: true,
                            publicId: true,
                            subject: true,
                            status: true,
                        },
                    },

                    cotizacion: {
                        select: {
                            id: true,
                            estado: true,
                            total: true,
                        },
                    },

                    visita: {
                        select: {
                            id_visita: true,
                            inicio: true,
                            status: true,
                        },
                    },

                    equipo: {
                        select: {
                            id_equipo: true,
                            serial: true,
                            marca: true,
                            modelo: true,
                        },
                    },

                    suscripcion: {
                        select: {
                            id: true,
                            empresaId: true,
                            productoPlan: true,
                            fechaRenovacion: true,
                            fechaTermino: true,
                            empresa: {
                                select: {
                                    nombre: true,
                                },
                            },
                        },
                    },
                },
            });

        const pendientesNoLeidos =
            await prisma.recordatorio.count({
                where: {
                    destinatarioId:
                        tecnicoId,

                    estado:
                        EstadoRecordatorio.PENDIENTE,

                    leidoAt:
                        null,

                    OR: [
                        /*
                         * Recordatorios vencidos de cualquier origen.
                         */
                        {
                            fechaProgramada: {
                                lte: ahora,
                            },
                        },

                        /*
                         * Recordatorios de tickets pendientes dentro
                         * de los próximos 30 días.
                         */
                        {
                            origen:
                                OrigenRecordatorio.TICKET,

                            fechaProgramada: {
                                lte: limiteFuturo,
                            },
                        },
                    ],
                },
            });

        const rol =
            (
                req as Request & {
                    user?: { rol?: string };
                }
            ).user?.rol;

        /* Taller y vencimientos: solo roles internos (no CLIENTE) */
        const esInterno =
            !!rol &&
            ROLES_TALLER_CAMPANA.has(rol);

        const [
            taller,
            suscripciones,
            visitasVencidas,
            ticketsActivos,
            cotizacionesBorrador,
        ] = await Promise.all([
            obtenerOrdenesTallerPendientes(
                rol
            ),

            esInterno
                ? vencimientosSuscripcionesCampana()
                : Promise.resolve([]),

            obtenerVisitasVencidas(
                rol,
                tecnicoId
            ),

            obtenerTicketsActivos(
                rol
            ),

            obtenerCotizacionesBorrador(
                rol
            ),
        ]);

        return res.json({
            data: recordatorios,
            pendientesNoLeidos,
            taller,
            suscripciones,
            visitasVencidas,
            ticketsActivos,
            cotizacionesBorrador
        });
    } catch (error) {
        console.error(
            "Error obteniendo recordatorios:",
            error
        );

        return res.status(500).json({
            error:
                "No fue posible obtener los recordatorios.",
        });
    }
}

/* =====================================================
   MARCAR COMO LEÍDO
===================================================== */

export async function marcarRecordatorioLeido(
    req: Request,
    res: Response
) {
    try {
        const tecnicoId =
            getTecnicoIdAutenticado(req);

        const id =
            parsePositiveInt(req.params.id);

        if (!tecnicoId || !id) {
            return res.status(400).json({
                error:
                    "Datos de recordatorio inválidos.",
            });
        }

        const resultado =
            await prisma.recordatorio.updateMany({
                where: {
                    id,
                    destinatarioId:
                        tecnicoId,
                },

                data: {
                    leidoAt:
                        new Date(),
                },
            });

        if (resultado.count === 0) {
            return res.status(404).json({
                error:
                    "Recordatorio no encontrado.",
            });
        }

        return res.json({
            message:
                "Recordatorio marcado como leído.",
        });
    } catch (error) {
        console.error(
            "Error marcando recordatorio como leído:",
            error
        );

        return res.status(500).json({
            error:
                "No fue posible actualizar el recordatorio.",
        });
    }
}

/* =====================================================
   COMPLETAR RECORDATORIO
===================================================== */

export async function completarRecordatorio(
    req: Request,
    res: Response
) {
    try {
        const tecnicoId =
            getTecnicoIdAutenticado(req);

        const id =
            parsePositiveInt(req.params.id);

        if (!tecnicoId || !id) {
            return res.status(400).json({
                error:
                    "Datos de recordatorio inválidos.",
            });
        }

        /*
         * Se obtiene primero para conocer si está relacionado
         * con una bitácora técnica.
         */
        const recordatorio =
            await prisma.recordatorio.findFirst({
                where: {
                    id,
                    destinatarioId:
                        tecnicoId,
                },

                select: {
                    id: true,
                    bitacoraId: true,
                },
            });

        if (!recordatorio) {
            return res.status(404).json({
                error:
                    "Recordatorio no encontrado.",
            });
        }

        const ahora =
            new Date();

        /*
         * La transacción evita que Recordatorio y BitacoraTecnico
         * queden con estados distintos.
         */
        await prisma.$transaction(
            async (tx) => {
                await tx.recordatorio.update({
                    where: {
                        id:
                            recordatorio.id,
                    },

                    data: {
                        estado:
                            EstadoRecordatorio.COMPLETADO,

                        completadoAt:
                            ahora,

                        leidoAt:
                            ahora,

                        canceladoAt:
                            null,
                    },
                });

                /*
                 * Solo se actualiza BitacoraTecnico cuando
                 * el recordatorio proviene de una bitácora.
                 */
                if (recordatorio.bitacoraId) {
                    await tx.bitacoraTecnico.update({
                        where: {
                            id:
                                recordatorio.bitacoraId,
                        },

                        data: {
                            recordatorioCompletado:
                                true,

                            recordatorioCompletadoAt:
                                ahora,
                        },
                    });
                }
            }
        );

        return res.json({
            message:
                "Recordatorio completado correctamente.",
        });
    } catch (error) {
        console.error(
            "Error completando recordatorio:",
            error
        );

        return res.status(500).json({
            error:
                "No fue posible completar el recordatorio.",
        });
    }
}

/* =====================================================
   REACTIVAR RECORDATORIO
===================================================== */

export async function reactivarRecordatorio(
    req: Request,
    res: Response
) {
    try {
        const tecnicoId =
            getTecnicoIdAutenticado(req);

        const id =
            parsePositiveInt(req.params.id);

        if (!tecnicoId || !id) {
            return res.status(400).json({
                error:
                    "Datos de recordatorio inválidos.",
            });
        }

        /*
         * Se obtiene la relación antes de actualizar
         * para poder sincronizar BitacoraTecnico.
         */
        const recordatorio =
            await prisma.recordatorio.findFirst({
                where: {
                    id,
                    destinatarioId:
                        tecnicoId,
                },

                select: {
                    id: true,
                    bitacoraId: true,
                },
            });

        if (!recordatorio) {
            return res.status(404).json({
                error:
                    "Recordatorio no encontrado.",
            });
        }

        await prisma.$transaction(
            async (tx) => {
                await tx.recordatorio.update({
                    where: {
                        id:
                            recordatorio.id,
                    },

                    data: {
                        estado:
                            EstadoRecordatorio.PENDIENTE,

                        completadoAt:
                            null,

                        canceladoAt:
                            null,

                        leidoAt:
                            null,

                        /*
                         * Permite que el proceso automático
                         * vuelva a mostrar el aviso.
                         */
                        notificadoAt:
                            null,
                    },
                });

                if (recordatorio.bitacoraId) {
                    await tx.bitacoraTecnico.update({
                        where: {
                            id:
                                recordatorio.bitacoraId,
                        },

                        data: {
                            recordatorioCompletado:
                                false,

                            recordatorioCompletadoAt:
                                null,

                            recordatorioNotificadoAt:
                                null,
                        },
                    });
                }
            }
        );

        return res.json({
            message:
                "Recordatorio reactivado correctamente.",
        });
    } catch (error) {
        console.error(
            "Error reactivando recordatorio:",
            error
        );

        return res.status(500).json({
            error:
                "No fue posible reactivar el recordatorio.",
        });
    }
}

/* =====================================================
   CANCELAR RECORDATORIO
===================================================== */

export async function cancelarRecordatorio(
    req: Request,
    res: Response
) {
    try {
        const tecnicoId =
            getTecnicoIdAutenticado(req);

        const id =
            parsePositiveInt(req.params.id);

        if (!tecnicoId || !id) {
            return res.status(400).json({
                error:
                    "Datos de recordatorio inválidos.",
            });
        }

        const recordatorio =
            await prisma.recordatorio.findFirst({
                where: {
                    id,
                    destinatarioId:
                        tecnicoId,
                },

                select: {
                    id: true,
                    bitacoraId: true,
                },
            });

        if (!recordatorio) {
            return res.status(404).json({
                error:
                    "Recordatorio no encontrado.",
            });
        }

        const ahora =
            new Date();

        await prisma.$transaction(
            async (tx) => {
                await tx.recordatorio.update({
                    where: {
                        id:
                            recordatorio.id,
                    },

                    data: {
                        estado:
                            EstadoRecordatorio.CANCELADO,

                        canceladoAt:
                            ahora,

                        leidoAt:
                            ahora,

                        completadoAt:
                            null,
                    },
                });

                /*
                 * En bitácoras se elimina la fecha antigua,
                 * evitando que el frontend siga mostrándola.
                 */
                if (recordatorio.bitacoraId) {
                    await tx.bitacoraTecnico.update({
                        where: {
                            id:
                                recordatorio.bitacoraId,
                        },

                        data: {
                            recordatorioAt:
                                null,

                            recordatorioCompletado:
                                false,

                            recordatorioCompletadoAt:
                                null,

                            recordatorioNotificadoAt:
                                null,
                        },
                    });
                }
            }
        );

        return res.json({
            message:
                "Recordatorio cancelado correctamente.",
        });
    } catch (error) {
        console.error(
            "Error cancelando recordatorio:",
            error
        );

        return res.status(500).json({
            error:
                "No fue posible cancelar el recordatorio.",
        });
    }
}

/* =====================================================
   CANCELAR TODOS MIS RECORDATORIOS
===================================================== */

export async function cancelarTodosMisRecordatorios(
    req: Request,
    res: Response
) {
    try {
        /*
         * Se reutiliza el helper existente para obtener
         * el técnico correspondiente al usuario autenticado.
         */
        const tecnicoId =
            getTecnicoIdAutenticado(req);

        if (!tecnicoId) {
            return res.status(401).json({
                error:
                    "No fue posible identificar al usuario autenticado.",
            });
        }

        /*
         * Primero se obtienen los recordatorios pendientes
         * para conocer cuáles están vinculados a bitácoras.
         */
        const recordatoriosPendientes =
            await prisma.recordatorio.findMany({
                where: {
                    destinatarioId:
                        tecnicoId,

                    estado:
                        EstadoRecordatorio.PENDIENTE,
                },

                select: {
                    id: true,
                    bitacoraId: true,
                },
            });

        if (
            recordatoriosPendientes.length === 0
        ) {
            return res.json({
                message:
                    "No existen recordatorios pendientes para cancelar.",

                cantidad:
                    0,
            });
        }

        const ahora =
            new Date();

        /*
         * Obtener IDs de bitácoras sin duplicados.
         */
        const bitacoraIds =
            Array.from(
                new Set(
                    recordatoriosPendientes
                        .map(
                            (recordatorio) =>
                                recordatorio.bitacoraId
                        )
                        .filter(
                            (
                                id
                            ): id is number =>
                                typeof id ===
                                "number"
                        )
                )
            );

        /*
         * La transacción garantiza que los recordatorios
         * globales y las bitácoras queden sincronizados.
         */
        await prisma.$transaction(
            async (tx) => {
                /*
                 * Cancelar todos los recordatorios pendientes
                 * pertenecientes al usuario autenticado.
                 */
                await tx.recordatorio.updateMany({
                    where: {
                        destinatarioId:
                            tecnicoId,

                        estado:
                            EstadoRecordatorio.PENDIENTE,
                    },

                    data: {
                        estado:
                            EstadoRecordatorio.CANCELADO,

                        canceladoAt:
                            ahora,

                        leidoAt:
                            ahora,

                        completadoAt:
                            null,

                        notificadoAt:
                            null,
                    },
                });

                /*
                 * Las bitácoras aún mantienen campos internos
                 * de recordatorio. Se limpian para que la interfaz
                 * no continúe mostrándolos.
                 */
                if (bitacoraIds.length > 0) {
                    await tx.bitacoraTecnico.updateMany({
                        where: {
                            id: {
                                in:
                                    bitacoraIds,
                            },
                        },

                        data: {
                            recordatorioAt:
                                null,

                            recordatorioCompletado:
                                false,

                            recordatorioCompletadoAt:
                                null,

                            recordatorioNotificadoAt:
                                null,
                        },
                    });
                }
            }
        );

        return res.json({
            message:
                "Todos los recordatorios pendientes fueron eliminados correctamente.",

            cantidad:
                recordatoriosPendientes.length,
        });
    } catch (error) {
        console.error(
            "Error cancelando todos los recordatorios:",
            error
        );

        return res.status(500).json({
            error:
                "No fue posible eliminar todos los recordatorios.",
        });
    }
}