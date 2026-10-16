import { prisma } from "../../../lib/prisma.js";
import { TicketPriority, TicketStatus, TicketEventType } from "@prisma/client";
import { getSlaConfigFromDB } from "../../../config/sla.config.js";
export function getSlaTargets(priority, slaConfig) {
    const key = String(priority || "NORMAL").toUpperCase();
    return slaConfig[key] ?? slaConfig["NORMAL"] ?? {
        firstResponseMinutes: 60,
        resolutionMinutes: 90,
    };
}
function addMinutes(date, minutes) {
    return new Date(date.getTime() + minutes * 60 * 1000);
}
function addMilliseconds(date, milliseconds) {
    return new Date(date.getTime() + milliseconds);
}
function clampDate(date, min, max) {
    if (date < min)
        return min;
    if (date > max)
        return max;
    return date;
}
function getPendingPauseMs(ticket, from, until) {
    const events = Array.isArray(ticket.events) ? ticket.events : [];
    const statusEvents = events
        .filter((event) => event.type === TicketEventType.STATUS_CHANGED &&
        event.createdAt)
        .map((event) => ({
        ...event,
        createdAtDate: new Date(event.createdAt),
    }))
        .filter((event) => !Number.isNaN(event.createdAtDate.getTime()))
        .sort((a, b) => a.createdAtDate.getTime() - b.createdAtDate.getTime());
    let pauseMs = 0;
    let pendingStartedAt = null;
    for (const event of statusEvents) {
        if (event.createdAtDate < from) {
            if (event.newValue === TicketStatus.PENDING) {
                pendingStartedAt = from;
            }
            if (pendingStartedAt &&
                event.newValue &&
                event.newValue !== TicketStatus.PENDING) {
                pendingStartedAt = null;
            }
            continue;
        }
        if (event.createdAtDate > until) {
            break;
        }
        if (event.newValue === TicketStatus.PENDING) {
            pendingStartedAt = clampDate(event.createdAtDate, from, until);
            continue;
        }
        if (pendingStartedAt &&
            event.newValue &&
            event.newValue !== TicketStatus.PENDING) {
            const pauseEndAt = clampDate(event.createdAtDate, from, until);
            pauseMs += Math.max(0, pauseEndAt.getTime() - pendingStartedAt.getTime());
            pendingStartedAt = null;
        }
    }
    if (pendingStartedAt) {
        pauseMs += Math.max(0, until.getTime() - pendingStartedAt.getTime());
    }
    return pauseMs;
}
function diffMinutes(a, b) {
    return Math.max(0, Math.round((b.getTime() - a.getTime()) / 60000));
}
function getAssignedAt(ticket) {
    /*
     * Si actualmente no tiene técnico,
     * el SLA queda esperando asignación.
     */
    if (!ticket.assigneeId) {
        return null;
    }
    const events = Array.isArray(ticket.events)
        ? ticket.events
        : [];
    const assignmentEvents = events
        .filter((event) => event.type ===
        TicketEventType.ASSIGNED &&
        event.createdAt)
        .map((event) => ({
        ...event,
        createdAtDate: new Date(event.createdAt),
    }))
        .filter((event) => !Number.isNaN(event.createdAtDate
        .getTime()))
        .sort((a, b) => a.createdAtDate
        .getTime() -
        b.createdAtDate
            .getTime());
    /*
     * =====================================================
     * CICLO REABIERTO
     * =====================================================
     */
    const reopenedAt = ticket.lastReopenedAt
        ? new Date(ticket.lastReopenedAt)
        : null;
    if (reopenedAt &&
        !Number.isNaN(reopenedAt.getTime())) {
        /*
         * Averiguamos si en el momento de la
         * reapertura el ticket ya estaba asignado.
         */
        const lastAssignmentBeforeReopen = [...assignmentEvents]
            .filter((event) => event.createdAtDate <=
            reopenedAt)
            .reverse()[0];
        /*
         * Si había técnico al momento de reabrir,
         * el SLA empieza exactamente en la reapertura.
         */
        if (lastAssignmentBeforeReopen
            ?.newValue) {
            return reopenedAt;
        }
        /*
         * Si estaba sin técnico al reabrirse,
         * buscamos la primera asignación posterior.
         */
        const firstAssignmentAfterReopen = assignmentEvents.find((event) => event.createdAtDate >
            reopenedAt &&
            Boolean(event.newValue));
        if (firstAssignmentAfterReopen
            ?.createdAtDate) {
            return firstAssignmentAfterReopen
                .createdAtDate;
        }
        /*
         * Fallback para registros antiguos:
         * sabemos que actualmente sí tiene técnico,
         * pero puede faltar el evento ASSIGNED.
         */
        return reopenedAt;
    }
    /*
     * =====================================================
     * CICLO ORIGINAL
     * =====================================================
     */
    const firstAssignment = assignmentEvents.find((event) => Boolean(event.newValue));
    if (firstAssignment
        ?.createdAtDate) {
        return firstAssignment
            .createdAtDate;
    }
    /*
     * Igual que en tu implementación actual:
     * no usamos createdAt del ticket como fallback.
     */
    return null;
}
function signedDiffMinutes(from, to) {
    return Math.round((to.getTime() - from.getTime()) / 60000);
}
export function buildTicketSla(ticket, slaConfig) {
    const now = new Date();
    const targets = getSlaTargets(ticket.priority, slaConfig);
    /*
     * getAssignedAt ya entiende tanto:
     *
     * - ciclo original;
     * - ciclo reabierto;
     * - asignación posterior a reapertura.
     */
    const slaStartAt = getAssignedAt(ticket);
    if (!slaStartAt) {
        return {
            targets,
            startsAt: null,
            waitingAssignment: true,
            paused: false,
            firstResponse: {
                dueAt: null,
                at: null,
                elapsedMinutes: null,
                status: "PENDING",
                remainingMinutes: null,
            },
            resolution: {
                dueAt: null,
                at: null,
                elapsedMinutes: null,
                status: "PENDING",
                remainingMinutes: null,
            },
        };
    }
    const firstResponseStartAt = slaStartAt;
    const resolutionStartAt = slaStartAt;
    /*
     * Solo usamos firstResponseAt si pertenece
     * al ciclo SLA actual.
     */
    const rawFirstResponseAt = ticket.firstResponseAt
        ? new Date(ticket.firstResponseAt)
        : null;
    const firstResponseAt = rawFirstResponseAt &&
        !Number.isNaN(rawFirstResponseAt.getTime()) &&
        rawFirstResponseAt >=
            slaStartAt
        ? rawFirstResponseAt
        : null;
    /*
     * Igual con la resolución/cierre.
     */
    const rawResolutionEndAt = ticket.closedAt
        ? new Date(ticket.closedAt)
        : ticket.resolvedAt
            ? new Date(ticket.resolvedAt)
            : null;
    const resolutionEndAt = rawResolutionEndAt &&
        !Number.isNaN(rawResolutionEndAt.getTime()) &&
        rawResolutionEndAt >=
            slaStartAt
        ? rawResolutionEndAt
        : null;
    const isTerminated = ticket.status ===
        TicketStatus.CLOSED ||
        ticket.status ===
            TicketStatus.RESOLVED;
    /*
     * Mantiene tu comportamiento actual:
     *
     * Si se cerró sin una respuesta explícita,
     * el cierre administrativo finaliza también
     * la medición de primera respuesta.
     */
    const administrativeFirstResponseAt = !firstResponseAt &&
        isTerminated &&
        resolutionEndAt
        ? resolutionEndAt
        : null;
    const firstResponseEndAt = firstResponseAt ??
        administrativeFirstResponseAt;
    const firstResponseMeasureUntil = firstResponseEndAt ??
        now;
    const resolutionMeasureUntil = resolutionEndAt ??
        now;
    /*
     * PENDING sigue pausando el SLA.
     *
     * Al usar slaStartAt, solamente se contabilizan
     * las pausas pertenecientes al ciclo actual.
     */
    const firstResponsePauseMs = getPendingPauseMs(ticket, firstResponseStartAt, firstResponseMeasureUntil);
    const resolutionPauseMs = getPendingPauseMs(ticket, resolutionStartAt, resolutionMeasureUntil);
    const firstResponseDueAt = addMilliseconds(addMinutes(firstResponseStartAt, targets
        .firstResponseMinutes), firstResponsePauseMs);
    const resolutionDueAt = addMilliseconds(addMinutes(resolutionStartAt, targets
        .resolutionMinutes), resolutionPauseMs);
    const slaPaused = ticket.status ===
        TicketStatus.PENDING;
    let firstResponseStatus = "PENDING";
    if (firstResponseEndAt) {
        firstResponseStatus =
            firstResponseEndAt <=
                firstResponseDueAt
                ? "OK"
                : "BREACHED";
    }
    else if (now >
        firstResponseDueAt) {
        firstResponseStatus =
            "BREACHED";
    }
    let resolutionStatus = "PENDING";
    if (resolutionEndAt) {
        resolutionStatus =
            resolutionEndAt <=
                resolutionDueAt
                ? "OK"
                : "BREACHED";
    }
    else if (now >
        resolutionDueAt) {
        resolutionStatus =
            "BREACHED";
    }
    return {
        targets,
        startsAt: slaStartAt,
        waitingAssignment: false,
        paused: slaPaused,
        firstResponse: {
            dueAt: firstResponseDueAt,
            at: firstResponseEndAt,
            elapsedMinutes: firstResponseEndAt
                ? diffMinutes(firstResponseStartAt, firstResponseEndAt)
                : null,
            status: firstResponseStatus,
            remainingMinutes: firstResponseEndAt
                ? 0
                : signedDiffMinutes(now, firstResponseDueAt),
        },
        resolution: {
            dueAt: resolutionDueAt,
            at: resolutionEndAt,
            elapsedMinutes: resolutionEndAt
                ? diffMinutes(resolutionStartAt, resolutionEndAt)
                : null,
            status: resolutionStatus,
            remainingMinutes: resolutionEndAt
                ? 0
                : signedDiffMinutes(now, resolutionDueAt),
        },
    };
}
export async function getTicketSla(req, res) {
    try {
        const slaConfig = await getSlaConfigFromDB();
        const empresaId = req.query.empresaId
            ? Number(req.query.empresaId)
            : undefined;
        const from = req.query.from
            ? new Date(req.query.from)
            : undefined;
        const to = req.query.to
            ? new Date(req.query.to)
            : undefined;
        /*
         * =====================================================
         * CICLOS ACTUALES
         * =====================================================
         */
        const tickets = await prisma.ticket.findMany({
            where: {
                deletedAt: null,
                ...(empresaId
                    ? {
                        empresaId,
                    }
                    : {}),
                /*
                 * El filtro del ciclo actual usa
                 * la fecha de inicio del ticket
                 * para tickets originales.
                 *
                 * Los ciclos históricos usan
                 * startedAt más abajo.
                 */
                ...(from || to
                    ? {
                        OR: [
                            {
                                createdAt: {
                                    ...(from
                                        ? {
                                            gte: from,
                                        }
                                        : {}),
                                    ...(to
                                        ? {
                                            lte: to,
                                        }
                                        : {}),
                                },
                            },
                            {
                                lastReopenedAt: {
                                    ...(from
                                        ? {
                                            gte: from,
                                        }
                                        : {}),
                                    ...(to
                                        ? {
                                            lte: to,
                                        }
                                        : {}),
                                },
                            },
                        ],
                    }
                    : {}),
            },
            select: {
                id: true,
                createdAt: true,
                firstResponseAt: true,
                resolvedAt: true,
                lastReopenedAt: true,
                closedAt: true,
                status: true,
                priority: true,
                assigneeId: true,
                slaCycleNumber: true,
                assignee: {
                    select: {
                        id_tecnico: true,
                        nombre: true,
                    },
                },
                events: {
                    where: {
                        type: {
                            in: [
                                TicketEventType
                                    .ASSIGNED,
                                TicketEventType
                                    .STATUS_CHANGED,
                                TicketEventType
                                    .REOPENED,
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
        });
        /*
         * =====================================================
         * CICLOS HISTÓRICOS
         * =====================================================
         */
        const historicalCycles = await prisma.ticketSlaCycle.findMany({
            where: {
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
                        startedAt: {
                            ...(from
                                ? {
                                    gte: from,
                                }
                                : {}),
                            ...(to
                                ? {
                                    lte: to,
                                }
                                : {}),
                        },
                    }
                    : {}),
            },
        });
        let frTotal = 0;
        let frOk = 0;
        let frBreached = 0;
        let frPending = 0;
        let rsTotal = 0;
        let rsOk = 0;
        let rsBreached = 0;
        let rsPending = 0;
        let frMinutesSum = 0;
        let frMinutesCount = 0;
        let rsMinutesSum = 0;
        let rsMinutesCount = 0;
        const byTechnicianMap = new Map();
        /*
         * Función auxiliar para inicializar
         * una fila de técnico.
         */
        const ensureTechnician = (tecnicoId, tecnicoNombre) => {
            if (!byTechnicianMap
                .has(tecnicoId)) {
                byTechnicianMap.set(tecnicoId, {
                    tecnicoId,
                    tecnicoNombre,
                    /*
                     * Ahora representa ciclos
                     * SLA medidos.
                     */
                    totalTickets: 0,
                    firstResponseOk: 0,
                    firstResponseBreached: 0,
                    resolutionOk: 0,
                    resolutionBreached: 0,
                    firstResponseMinutesSum: 0,
                    firstResponseMinutesCount: 0,
                    resolutionMinutesSum: 0,
                    resolutionMinutesCount: 0,
                });
            }
            return byTechnicianMap
                .get(tecnicoId);
        };
        /*
         * =====================================================
         * HISTÓRICOS
         * =====================================================
         */
        for (const cycle of historicalCycles) {
            frTotal++;
            if (cycle.firstResponseStatus ===
                "OK") {
                frOk++;
            }
            if (cycle.firstResponseStatus ===
                "BREACHED") {
                frBreached++;
            }
            if (cycle.firstResponseStatus ===
                "PENDING") {
                frPending++;
            }
            rsTotal++;
            if (cycle.resolutionStatus ===
                "OK") {
                rsOk++;
            }
            if (cycle.resolutionStatus ===
                "BREACHED") {
                rsBreached++;
            }
            if (cycle.resolutionStatus ===
                "PENDING") {
                rsPending++;
            }
            if (cycle
                .firstResponseElapsedMinutes !==
                null) {
                frMinutesSum +=
                    cycle
                        .firstResponseElapsedMinutes;
                frMinutesCount++;
            }
            if (cycle
                .resolutionElapsedMinutes !==
                null) {
                rsMinutesSum +=
                    cycle
                        .resolutionElapsedMinutes;
                rsMinutesCount++;
            }
            if (cycle.assigneeId) {
                const tecnico = await prisma.tecnico.findUnique({
                    where: {
                        id_tecnico: cycle.assigneeId,
                    },
                    select: {
                        nombre: true,
                    },
                });
                const stat = ensureTechnician(cycle.assigneeId, tecnico
                    ?.nombre ??
                    `Técnico #${cycle.assigneeId}`);
                stat.totalTickets++;
                if (cycle
                    .firstResponseStatus ===
                    "OK") {
                    stat
                        .firstResponseOk++;
                }
                if (cycle
                    .firstResponseStatus ===
                    "BREACHED") {
                    stat
                        .firstResponseBreached++;
                }
                if (cycle
                    .resolutionStatus ===
                    "OK") {
                    stat
                        .resolutionOk++;
                }
                if (cycle
                    .resolutionStatus ===
                    "BREACHED") {
                    stat
                        .resolutionBreached++;
                }
                if (cycle
                    .firstResponseElapsedMinutes !==
                    null) {
                    stat
                        .firstResponseMinutesSum +=
                        cycle
                            .firstResponseElapsedMinutes;
                    stat
                        .firstResponseMinutesCount++;
                }
                if (cycle
                    .resolutionElapsedMinutes !==
                    null) {
                    stat
                        .resolutionMinutesSum +=
                        cycle
                            .resolutionElapsedMinutes;
                    stat
                        .resolutionMinutesCount++;
                }
            }
        }
        /*
         * =====================================================
         * CICLO ACTUAL DE CADA TICKET
         * =====================================================
         */
        for (const ticket of tickets) {
            const sla = buildTicketSla(ticket, slaConfig);
            if (sla.waitingAssignment) {
                continue;
            }
            const tieneRespuesta = ticket.firstResponseAt !==
                null;
            const tieneCierre = ticket.closedAt !==
                null ||
                ticket.resolvedAt !==
                    null;
            const estaActivo = ticket.status !==
                TicketStatus.CLOSED &&
                ticket.status !==
                    TicketStatus.RESOLVED;
            if (tieneRespuesta ||
                tieneCierre ||
                estaActivo) {
                frTotal++;
                if (sla.firstResponse
                    .status ===
                    "OK") {
                    frOk++;
                }
                if (sla.firstResponse
                    .status ===
                    "BREACHED") {
                    frBreached++;
                }
                if (sla.firstResponse
                    .status ===
                    "PENDING") {
                    frPending++;
                }
            }
            if (tieneCierre ||
                estaActivo) {
                rsTotal++;
                if (sla.resolution
                    .status ===
                    "OK") {
                    rsOk++;
                }
                if (sla.resolution
                    .status ===
                    "BREACHED") {
                    rsBreached++;
                }
                if (sla.resolution
                    .status ===
                    "PENDING") {
                    rsPending++;
                }
            }
            if (sla.firstResponse
                .elapsedMinutes !==
                null) {
                frMinutesSum +=
                    sla.firstResponse
                        .elapsedMinutes;
                frMinutesCount++;
            }
            if (sla.resolution
                .elapsedMinutes !==
                null) {
                rsMinutesSum +=
                    sla.resolution
                        .elapsedMinutes;
                rsMinutesCount++;
            }
            if (ticket.assigneeId &&
                ticket.assignee) {
                const stat = ensureTechnician(ticket.assigneeId, ticket.assignee
                    .nombre);
                stat.totalTickets++;
                if (sla.firstResponse
                    .status ===
                    "OK") {
                    stat
                        .firstResponseOk++;
                }
                if (sla.firstResponse
                    .status ===
                    "BREACHED") {
                    stat
                        .firstResponseBreached++;
                }
                if (sla.resolution
                    .status ===
                    "OK") {
                    stat
                        .resolutionOk++;
                }
                if (sla.resolution
                    .status ===
                    "BREACHED") {
                    stat
                        .resolutionBreached++;
                }
                if (sla.firstResponse
                    .elapsedMinutes !==
                    null) {
                    stat
                        .firstResponseMinutesSum +=
                        sla.firstResponse
                            .elapsedMinutes;
                    stat
                        .firstResponseMinutesCount++;
                }
                if (sla.resolution
                    .elapsedMinutes !==
                    null) {
                    stat
                        .resolutionMinutesSum +=
                        sla.resolution
                            .elapsedMinutes;
                    stat
                        .resolutionMinutesCount++;
                }
            }
        }
        const technicians = Array
            .from(byTechnicianMap
            .values())
            .map((t) => ({
            ...t,
            avgFirstResponseMinutes: t.firstResponseMinutesCount >
                0
                ? Math.round(t.firstResponseMinutesSum /
                    t.firstResponseMinutesCount)
                : 0,
            avgResolutionMinutes: t.resolutionMinutesCount >
                0
                ? Math.round(t.resolutionMinutesSum /
                    t.resolutionMinutesCount)
                : 0,
            firstResponseCompliance: t.totalTickets >
                0
                ? Math.round((t.firstResponseOk /
                    t.totalTickets) *
                    100)
                : 0,
            resolutionCompliance: t.totalTickets >
                0
                ? Math.round((t.resolutionOk /
                    t.totalTickets) *
                    100)
                : 0,
        }));
        return res.json({
            ok: true,
            sla: {
                firstResponse: {
                    total: frTotal,
                    ok: frOk,
                    breached: frBreached,
                    pending: frPending,
                    compliance: frTotal >
                        0
                        ? Math.round((frOk /
                            frTotal) *
                            100)
                        : 0,
                    avgMinutes: frMinutesCount >
                        0
                        ? Math.round(frMinutesSum /
                            frMinutesCount)
                        : null,
                },
                resolution: {
                    total: rsTotal,
                    ok: rsOk,
                    breached: rsBreached,
                    pending: rsPending,
                    compliance: rsTotal >
                        0
                        ? Math.round((rsOk /
                            rsTotal) *
                            100)
                        : 0,
                    avgMinutes: rsMinutesCount >
                        0
                        ? Math.round(rsMinutesSum /
                            rsMinutesCount)
                        : null,
                },
                byTechnician: technicians,
            },
        });
    }
    catch (error) {
        console.error("[helpdesk] SLA error:", error);
        return res
            .status(500)
            .json({
            ok: false,
            message: "Error al calcular SLA",
        });
    }
}
//# sourceMappingURL=ticketera-sla.controller.js.map