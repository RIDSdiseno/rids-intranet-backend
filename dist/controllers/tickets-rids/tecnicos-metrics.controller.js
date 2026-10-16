import { prisma } from "../../lib/prisma.js";
import { TicketStatus } from "@prisma/client";
import { buildTicketSla } from "../tickets-rids/tickets-sla/ticketera-sla.controller.js";
import { getSlaConfigFromDB } from "../../config/sla.config.js";
export async function getTicketMetricsByTecnico(req, res) {
    try {
        /*
         * =====================================================
         * FILTROS
         * =====================================================
         */
        const empresaId = req.query.empresaId
            ? Number(req.query.empresaId)
            : undefined;
        const tecnicoId = req.query.tecnicoId
            ? Number(req.query.tecnicoId)
            : undefined;
        const from = req.query.from
            ? new Date(req.query.from)
            : undefined;
        const to = req.query.to
            ? new Date(req.query.to)
            : undefined;
        /*
         * =====================================================
         * CONFIGURACIÓN SLA
         * =====================================================
         */
        const slaConfig = await getSlaConfigFromDB();
        /*
         * =====================================================
         * TÉCNICOS EXCLUIDOS
         * =====================================================
         */
        const EXCLUDED_TECNICOS_EMAILS = [
            "hcabrera@rids.cl",
            "nrubio@rids.cl",
            "soporte@rids.cl",
            "ventas@econnet.cl",
            "diseno@rids.cl",
            "informaticap@rids.cl",
            "ncanales@rids.cl",
            "carenas@rids.cl",
            "ventas@rids.cl",
            "cespinoza@rids.cl",
        ];
        /*
         * =====================================================
         * TÉCNICOS ACTIVOS
         * =====================================================
         */
        const tecnicosActivos = await prisma.tecnico.findMany({
            where: {
                status: true,
                rol: {
                    in: [
                        "ADMIN",
                        "TECNICO",
                        "ADMINISTRACION",
                    ],
                },
                email: {
                    notIn: EXCLUDED_TECNICOS_EMAILS,
                },
                ...(tecnicoId
                    ? {
                        id_tecnico: tecnicoId,
                    }
                    : {}),
            },
            select: {
                id_tecnico: true,
                nombre: true,
                email: true,
            },
            orderBy: {
                nombre: "asc",
            },
        });
        const tecnicoIdsPermitidos = tecnicosActivos.map((tecnico) => tecnico.id_tecnico);
        /*
         * Si no hay técnicos válidos,
         * devolvemos arreglo vacío.
         */
        if (!tecnicoIdsPermitidos.length) {
            return res.json({
                ok: true,
                data: [],
            });
        }
        /*
         * =====================================================
         * TICKETS CERRADOS ACTUALES
         * =====================================================
         *
         * Cada Ticket representa su ciclo SLA más reciente.
         * Los ciclos anteriores se cargan después desde
         * TicketSlaCycle.
         */
        const tickets = await prisma.ticket.findMany({
            where: {
                deletedAt: null,
                assigneeId: {
                    in: tecnicoIdsPermitidos,
                },
                ...(empresaId
                    ? {
                        empresaId,
                    }
                    : {}),
                status: TicketStatus.CLOSED,
                ...(from || to
                    ? {
                        closedAt: {
                            ...(from
                                ? {
                                    gte: from,
                                }
                                : {}),
                            ...(to
                                ? {
                                    lt: to,
                                }
                                : {}),
                        },
                    }
                    : {}),
            },
            select: {
                id: true,
                subject: true,
                status: true,
                priority: true,
                createdAt: true,
                firstResponseAt: true,
                resolvedAt: true,
                closedAt: true,
                /*
                 * Necesario para calcular correctamente
                 * un ciclo SLA reabierto.
                 */
                lastReopenedAt: true,
                /*
                 * Identificador del ciclo SLA actual.
                 */
                slaCycleNumber: true,
                assigneeId: true,
                events: {
                    where: {
                        type: {
                            in: [
                                "ASSIGNED",
                                "STATUS_CHANGED",
                                "REOPENED",
                            ],
                        },
                    },
                    select: {
                        type: true,
                        oldValue: true,
                        newValue: true,
                        createdAt: true,
                    },
                    orderBy: {
                        createdAt: "asc",
                    },
                },
            },
            orderBy: {
                closedAt: "desc",
            },
        });
        /*
         * =====================================================
         * MAPA DE MÉTRICAS
         * =====================================================
         */
        const byTecnico = new Map();
        for (const tecnico of tecnicosActivos) {
            byTecnico.set(tecnico.id_tecnico, {
                tecnicoId: tecnico.id_tecnico,
                nombre: tecnico.nombre,
                email: tecnico.email,
                /*
                 * Métricas por ticket.
                 */
                assignedTickets: 0,
                openTickets: 0,
                pendingTickets: 0,
                resolvedTickets: 0,
                closedTickets: 0,
                reopenedTickets: 0,
                /*
                 * Métricas SLA por ciclo.
                 */
                firstResponseOk: 0,
                firstResponseBreached: 0,
                firstResponsePending: 0,
                resolutionOk: 0,
                resolutionBreached: 0,
                resolutionPending: 0,
                firstResponseMinutesSum: 0,
                firstResponseMinutesCount: 0,
                resolutionMinutesSum: 0,
                resolutionMinutesCount: 0,
            });
        }
        /*
         * =====================================================
         * CICLO SLA ACTUAL / ÚLTIMO
         * =====================================================
         */
        for (const ticket of tickets) {
            if (!ticket.assigneeId) {
                continue;
            }
            const row = byTecnico.get(ticket.assigneeId);
            if (!row) {
                continue;
            }
            const sla = buildTicketSla(ticket, slaConfig);
            /*
             * =================================================
             * MÉTRICAS DE TICKETS
             * =================================================
             *
             * Aquí sí contamos tickets reales.
             */
            row.assignedTickets++;
            row.closedTickets++;
            /*
             * Contamos cantidad real de reaperturas.
             */
            row.reopenedTickets +=
                ticket.events
                    ?.filter((event) => event.type ===
                    "REOPENED")
                    .length ??
                    0;
            /*
             * =================================================
             * MÉTRICAS SLA DEL CICLO ACTUAL
             * =================================================
             */
            if (sla.firstResponse.status ===
                "OK") {
                row.firstResponseOk++;
            }
            if (sla.firstResponse.status ===
                "BREACHED") {
                row.firstResponseBreached++;
            }
            if (sla.firstResponse.status ===
                "PENDING") {
                row.firstResponsePending++;
            }
            if (sla.resolution.status ===
                "OK") {
                row.resolutionOk++;
            }
            if (sla.resolution.status ===
                "BREACHED") {
                row.resolutionBreached++;
            }
            if (sla.resolution.status ===
                "PENDING") {
                row.resolutionPending++;
            }
            if (sla.firstResponse
                .elapsedMinutes !==
                null) {
                row.firstResponseMinutesSum +=
                    sla.firstResponse
                        .elapsedMinutes;
                row.firstResponseMinutesCount++;
            }
            if (sla.resolution
                .elapsedMinutes !==
                null) {
                row.resolutionMinutesSum +=
                    sla.resolution
                        .elapsedMinutes;
                row.resolutionMinutesCount++;
            }
        }
        /*
         * =====================================================
         * CICLOS SLA HISTÓRICOS
         * =====================================================
         */
        const historicalCycles = await prisma
            .ticketSlaCycle
            .findMany({
            where: {
                assigneeId: {
                    in: tecnicoIdsPermitidos,
                },
                /*
                 * Filtramos además por el ticket
                 * relacionado.
                 */
                ticket: {
                    deletedAt: null,
                    ...(empresaId
                        ? {
                            empresaId,
                        }
                        : {}),
                },
                /*
                 * El período histórico se evalúa
                 * contra el cierre del ciclo.
                 */
                ...(from || to
                    ? {
                        endedAt: {
                            ...(from
                                ? {
                                    gte: from,
                                }
                                : {}),
                            ...(to
                                ? {
                                    lt: to,
                                }
                                : {}),
                        },
                    }
                    : {}),
            },
        });
        /*
         * =====================================================
         * AGREGAR HISTÓRICOS A LAS MÉTRICAS SLA
         * =====================================================
         */
        for (const cycle of historicalCycles) {
            if (!cycle.assigneeId) {
                continue;
            }
            const row = byTecnico.get(cycle.assigneeId);
            if (!row) {
                continue;
            }
            /*
             * IMPORTANTE:
             *
             * NO incrementar:
             *
             * assignedTickets
             * closedTickets
             *
             * porque TicketSlaCycle representa
             * otro ciclo del mismo ticket.
             */
            if (cycle.firstResponseStatus ===
                "OK") {
                row.firstResponseOk++;
            }
            if (cycle.firstResponseStatus ===
                "BREACHED") {
                row.firstResponseBreached++;
            }
            if (cycle.firstResponseStatus ===
                "PENDING") {
                row.firstResponsePending++;
            }
            if (cycle.resolutionStatus ===
                "OK") {
                row.resolutionOk++;
            }
            if (cycle.resolutionStatus ===
                "BREACHED") {
                row.resolutionBreached++;
            }
            if (cycle.resolutionStatus ===
                "PENDING") {
                row.resolutionPending++;
            }
            if (cycle
                .firstResponseElapsedMinutes !==
                null) {
                row.firstResponseMinutesSum +=
                    cycle
                        .firstResponseElapsedMinutes;
                row.firstResponseMinutesCount++;
            }
            if (cycle
                .resolutionElapsedMinutes !==
                null) {
                row.resolutionMinutesSum +=
                    cycle
                        .resolutionElapsedMinutes;
                row.resolutionMinutesCount++;
            }
        }
        /*
         * =====================================================
         * RESPUESTA FINAL
         * =====================================================
         */
        const data = Array
            .from(byTecnico.values())
            .map((row) => {
            const firstResponseTotal = row.firstResponseOk +
                row.firstResponseBreached +
                row.firstResponsePending;
            const resolutionTotal = row.resolutionOk +
                row.resolutionBreached +
                row.resolutionPending;
            return {
                tecnicoId: row.tecnicoId,
                nombre: row.nombre,
                email: row.email,
                assignedTickets: row.assignedTickets,
                openTickets: row.openTickets,
                pendingTickets: row.pendingTickets,
                resolvedTickets: row.resolvedTickets,
                closedTickets: row.closedTickets,
                reopenedTickets: row.reopenedTickets,
                avgFirstResponseMinutes: row.firstResponseMinutesCount >
                    0
                    ? Math.round(row.firstResponseMinutesSum /
                        row.firstResponseMinutesCount)
                    : null,
                avgResolutionMinutes: row.resolutionMinutesCount >
                    0
                    ? Math.round(row.resolutionMinutesSum /
                        row.resolutionMinutesCount)
                    : null,
                firstResponse: {
                    ok: row.firstResponseOk,
                    breached: row.firstResponseBreached,
                    pending: row.firstResponsePending,
                    total: firstResponseTotal,
                    compliance: firstResponseTotal >
                        0
                        ? Math.round((row.firstResponseOk /
                            firstResponseTotal) *
                            100)
                        : 0,
                },
                resolution: {
                    ok: row.resolutionOk,
                    breached: row.resolutionBreached,
                    pending: row.resolutionPending,
                    total: resolutionTotal,
                    compliance: resolutionTotal >
                        0
                        ? Math.round((row.resolutionOk /
                            resolutionTotal) *
                            100)
                        : 0,
                },
            };
        });
        return res.json({
            ok: true,
            data,
        });
    }
    catch (error) {
        console.error("[helpdesk] getTicketMetricsByTecnico error:", error);
        return res
            .status(500)
            .json({
            ok: false,
            message: "Error al obtener métricas por técnico",
        });
    }
}
export async function getWorstClosedTicketsByTecnico(req, res) {
    try {
        const empresaId = req.query.empresaId
            ? Number(req.query.empresaId)
            : undefined;
        const from = req.query.from ? new Date(req.query.from) : undefined;
        const to = req.query.to ? new Date(req.query.to) : undefined;
        const limit = req.query.limit ? Number(req.query.limit) : 5;
        const slaConfig = await getSlaConfigFromDB();
        const EXCLUDED_TECNICOS_EMAILS = [
            "hcabrera@rids.cl",
            "nrubio@rids.cl",
            "soporte@rids.cl",
            "ventas@econnet.cl",
            "diseno@rids.cl",
            "informaticap@rids.cl",
            "ncanales@rids.cl",
            "carenas@rids.cl",
            "ventas@rids.cl",
            "cespinoza@rids.cl",
        ];
        const tecnicosActivos = await prisma.tecnico.findMany({
            where: {
                status: true,
                rol: {
                    in: ["ADMIN", "TECNICO", "ADMINISTRACION"],
                },
                email: {
                    notIn: EXCLUDED_TECNICOS_EMAILS,
                },
            },
            select: {
                id_tecnico: true,
                nombre: true,
                email: true,
            },
            orderBy: {
                nombre: "asc",
            },
        });
        const tecnicoIdsPermitidos = tecnicosActivos.map((tecnico) => tecnico.id_tecnico);
        const ticketsCerrados = await prisma.ticket.findMany({
            where: {
                deletedAt: null,
                assigneeId: {
                    not: null,
                },
                status: TicketStatus.CLOSED,
                ...(from || to
                    ? {
                        closedAt: {
                            ...(from && { gte: from }),
                            ...(to && { lt: to }),
                        },
                    }
                    : {}),
                ...(empresaId && { empresaId }),
            },
            select: {
                id: true,
                subject: true,
                status: true,
                priority: true,
                createdAt: true,
                firstResponseAt: true,
                resolvedAt: true,
                closedAt: true,
                lastReopenedAt: true,
                slaCycleNumber: true,
                assigneeId: true,
                events: {
                    where: {
                        type: {
                            in: [
                                "ASSIGNED",
                                "STATUS_CHANGED",
                                "REOPENED",
                            ],
                        },
                    },
                    select: {
                        // Necesario para calcular correctamente SLA con pausas.
                        type: true,
                        oldValue: true,
                        newValue: true,
                        createdAt: true,
                    },
                    orderBy: {
                        createdAt: "asc",
                    },
                },
            },
            orderBy: {
                closedAt: "desc",
            },
        });
        const byTecnico = new Map();
        for (const tecnico of tecnicosActivos) {
            byTecnico.set(tecnico.id_tecnico, {
                tecnicoId: tecnico.id_tecnico,
                nombre: tecnico.nombre,
                email: tecnico.email,
                assignedTickets: 0,
                openTickets: 0,
                pendingTickets: 0,
                resolvedTickets: 0,
                closedTickets: 0,
                reopenedTickets: 0,
                firstResponseOk: 0,
                firstResponseBreached: 0,
                firstResponsePending: 0,
                resolutionOk: 0,
                resolutionBreached: 0,
                resolutionPending: 0,
                firstResponseMinutesSum: 0,
                firstResponseMinutesCount: 0,
                resolutionMinutesSum: 0,
                resolutionMinutesCount: 0,
            });
        }
        for (const ticket of ticketsCerrados) {
            if (!ticket.assigneeId)
                continue;
            const row = byTecnico.get(ticket.assigneeId);
            if (!row)
                continue;
            const sla = buildTicketSla(ticket, slaConfig);
            row.assignedTickets++;
            row.closedTickets++;
            row.reopenedTickets +=
                ticket.events
                    ?.filter((event) => event.type ===
                    "REOPENED")
                    .length ??
                    0;
            if (sla.firstResponse.status === "OK")
                row.firstResponseOk++;
            if (sla.firstResponse.status === "BREACHED")
                row.firstResponseBreached++;
            if (sla.firstResponse.status === "PENDING")
                row.firstResponsePending++;
            if (sla.resolution.status === "OK")
                row.resolutionOk++;
            if (sla.resolution.status === "BREACHED")
                row.resolutionBreached++;
            if (sla.resolution.status === "PENDING")
                row.resolutionPending++;
            if (sla.firstResponse.elapsedMinutes !== null) {
                row.firstResponseMinutesSum += sla.firstResponse.elapsedMinutes;
                row.firstResponseMinutesCount++;
            }
            if (sla.resolution.elapsedMinutes !== null) {
                row.resolutionMinutesSum += sla.resolution.elapsedMinutes;
                row.resolutionMinutesCount++;
            }
        }
        const historicalCycles = await prisma.ticketSlaCycle.findMany({
            where: {
                assigneeId: {
                    in: tecnicoIdsPermitidos,
                },
                ticket: {
                    deletedAt: null,
                    ...(empresaId
                        ? {
                            empresaId,
                        }
                        : {}),
                },
                ...(from || to
                    ? {
                        endedAt: {
                            ...(from
                                ? {
                                    gte: from,
                                }
                                : {}),
                            ...(to
                                ? {
                                    lt: to,
                                }
                                : {}),
                        },
                    }
                    : {}),
            },
        });
        for (const cycle of historicalCycles) {
            if (!cycle.assigneeId) {
                continue;
            }
            const row = byTecnico.get(cycle.assigneeId);
            if (!row) {
                continue;
            }
            if (cycle.firstResponseStatus ===
                "OK") {
                row.firstResponseOk++;
            }
            if (cycle.firstResponseStatus ===
                "BREACHED") {
                row.firstResponseBreached++;
            }
            if (cycle.firstResponseStatus ===
                "PENDING") {
                row.firstResponsePending++;
            }
            if (cycle.resolutionStatus ===
                "OK") {
                row.resolutionOk++;
            }
            if (cycle.resolutionStatus ===
                "BREACHED") {
                row.resolutionBreached++;
            }
            if (cycle.resolutionStatus ===
                "PENDING") {
                row.resolutionPending++;
            }
            if (cycle.firstResponseElapsedMinutes !==
                null) {
                row.firstResponseMinutesSum +=
                    cycle.firstResponseElapsedMinutes;
                row.firstResponseMinutesCount++;
            }
            if (cycle.resolutionElapsedMinutes !==
                null) {
                row.resolutionMinutesSum +=
                    cycle.resolutionElapsedMinutes;
                row.resolutionMinutesCount++;
            }
        }
        const data = Array.from(byTecnico.values())
            .map((row) => {
            const firstResponseTotal = row.firstResponseOk +
                row.firstResponseBreached +
                row.firstResponsePending;
            const resolutionTotal = row.resolutionOk +
                row.resolutionBreached +
                row.resolutionPending;
            return {
                tecnicoId: row.tecnicoId,
                nombre: row.nombre,
                email: row.email,
                assignedTickets: row.assignedTickets,
                openTickets: row.openTickets,
                pendingTickets: row.pendingTickets,
                resolvedTickets: row.resolvedTickets,
                closedTickets: row.closedTickets,
                reopenedTickets: row.reopenedTickets,
                avgFirstResponseMinutes: row.firstResponseMinutesCount > 0
                    ? Math.round(row.firstResponseMinutesSum / row.firstResponseMinutesCount)
                    : null,
                avgResolutionMinutes: row.resolutionMinutesCount > 0
                    ? Math.round(row.resolutionMinutesSum / row.resolutionMinutesCount)
                    : null,
                firstResponse: {
                    ok: row.firstResponseOk,
                    breached: row.firstResponseBreached,
                    pending: row.firstResponsePending,
                    total: firstResponseTotal,
                    compliance: firstResponseTotal > 0
                        ? Math.round((row.firstResponseOk / firstResponseTotal) * 100)
                        : 0,
                },
                resolution: {
                    ok: row.resolutionOk,
                    breached: row.resolutionBreached,
                    pending: row.resolutionPending,
                    total: resolutionTotal,
                    compliance: resolutionTotal > 0
                        ? Math.round((row.resolutionOk / resolutionTotal) * 100)
                        : 0,
                },
            };
        })
            .sort((a, b) => {
            if (a.closedTickets !== b.closedTickets) {
                return a.closedTickets - b.closedTickets;
            }
            return a.nombre.localeCompare(b.nombre);
        })
            .slice(0, Number.isFinite(limit) && limit > 0 ? limit : 5);
        return res.json({
            ok: true,
            data,
        });
    }
    catch (error) {
        console.error("[helpdesk] getWorstClosedTicketsByTecnico error:", error);
        return res.status(500).json({
            ok: false,
            message: "Error al obtener técnicos con menos tickets cerrados",
        });
    }
}
//# sourceMappingURL=tecnicos-metrics.controller.js.map