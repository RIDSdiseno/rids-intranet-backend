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
     * Si actualmente no tiene técnico, se considera sin asignar.
     * El SLA queda pausado.
     */
    if (!ticket.assigneeId) {
        return null;
    }
    const events = Array.isArray(ticket.events)
        ? ticket.events
        : [];
    /*
     * El SLA debe comenzar en la primera asignación del ticket,
     * no en la asignación más reciente ni en la reasignación
     * al técnico actual.
     */
    const firstAssignment = events
        .filter((event) => event.type === TicketEventType.ASSIGNED &&
        event.newValue &&
        event.createdAt)
        .sort((a, b) => new Date(a.createdAt).getTime() -
        new Date(b.createdAt).getTime())[0];
    if (firstAssignment?.createdAt) {
        return new Date(firstAssignment.createdAt);
    }
    /*
     * No usar createdAt como fallback, porque eso haría que
     * el SLA comenzara desde la creación.
     *
     * Los tickets antiguos sin evento ASSIGNED deberán corregirse
     * mediante una migración o quedarán temporalmente sin SLA.
     */
    return null;
}
function signedDiffMinutes(from, to) {
    return Math.round((to.getTime() - from.getTime()) / 60000);
}
export function buildTicketSla(ticket, slaConfig) {
    const now = new Date();
    const targets = getSlaTargets(ticket.priority, slaConfig);
    const assignedAt = getAssignedAt(ticket);
    if (!assignedAt) {
        return {
            targets,
            startsAt: null,
            waitingAssignment: true,
            firstResponse: {
                dueAt: null,
                at: ticket.firstResponseAt ? new Date(ticket.firstResponseAt) : null,
                elapsedMinutes: null,
                status: "PENDING",
                remainingMinutes: null,
            },
            resolution: {
                dueAt: null,
                at: ticket.closedAt
                    ? new Date(ticket.closedAt)
                    : ticket.resolvedAt
                        ? new Date(ticket.resolvedAt)
                        : null,
                elapsedMinutes: null,
                status: "PENDING",
                remainingMinutes: null,
            },
        };
    }
    const firstResponseStartAt = assignedAt;
    const resolutionStartAt = assignedAt;
    const firstResponseAt = ticket.firstResponseAt
        ? new Date(ticket.firstResponseAt)
        : null;
    const resolutionEndAt = ticket.closedAt
        ? new Date(ticket.closedAt)
        : ticket.resolvedAt
            ? new Date(ticket.resolvedAt)
            : null;
    const isTerminated = ticket.status === TicketStatus.CLOSED ||
        ticket.status === TicketStatus.RESOLVED;
    /**
     * Si el ticket fue cerrado/resuelto sin primera respuesta real,
     * usamos closedAt/resolvedAt como fecha administrativa de término
     * de la medición de primera respuesta.
     */
    const administrativeFirstResponseAt = !firstResponseAt && isTerminated && resolutionEndAt
        ? resolutionEndAt
        : null;
    const firstResponseEndAt = firstResponseAt ?? administrativeFirstResponseAt;
    const firstResponseMeasureUntil = firstResponseEndAt ?? new Date();
    const resolutionMeasureUntil = resolutionEndAt ?? new Date();
    const firstResponsePauseMs = getPendingPauseMs(ticket, firstResponseStartAt, firstResponseMeasureUntil);
    const resolutionPauseMs = getPendingPauseMs(ticket, resolutionStartAt, resolutionMeasureUntil);
    const firstResponseDueAt = addMilliseconds(addMinutes(firstResponseStartAt, targets.firstResponseMinutes), firstResponsePauseMs);
    const resolutionDueAt = addMilliseconds(addMinutes(resolutionStartAt, targets.resolutionMinutes), resolutionPauseMs);
    const slaPaused = ticket.status === TicketStatus.PENDING;
    let firstResponseStatus = "PENDING";
    if (firstResponseEndAt) {
        firstResponseStatus =
            firstResponseEndAt <= firstResponseDueAt ? "OK" : "BREACHED";
    }
    else if (now > firstResponseDueAt) {
        firstResponseStatus = "BREACHED";
    }
    let resolutionStatus = "PENDING";
    if (resolutionEndAt) {
        resolutionStatus =
            resolutionEndAt <= resolutionDueAt ? "OK" : "BREACHED";
    }
    else {
        const isTerminated = ticket.status === TicketStatus.CLOSED ||
            ticket.status === TicketStatus.RESOLVED;
        if (isTerminated) {
            resolutionStatus = "OK";
        }
        else if (now > resolutionDueAt) {
            resolutionStatus = "BREACHED";
        }
    }
    return {
        targets,
        startsAt: assignedAt,
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
        const from = req.query.from ? new Date(req.query.from) : undefined;
        const to = req.query.to ? new Date(req.query.to) : undefined;
        const tickets = await prisma.ticket.findMany({
            where: {
                deletedAt: null,
                ...(empresaId && { empresaId }),
                ...(from || to
                    ? {
                        createdAt: {
                            ...(from && { gte: from }),
                            ...(to && { lte: to }),
                        },
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
                                TicketEventType.ASSIGNED,
                                TicketEventType.STATUS_CHANGED,
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
        let frTotal = 0, frOk = 0, frBreached = 0, frPending = 0;
        let rsTotal = 0, rsOk = 0, rsBreached = 0, rsPending = 0;
        let frMinutesSum = 0, frMinutesCount = 0;
        let rsMinutesSum = 0, rsMinutesCount = 0;
        const byTechnicianMap = new Map();
        for (const t of tickets) {
            const sla = buildTicketSla(t, slaConfig);
            /*
             * Un ticket sin asignación todavía no participa
             * en el resumen ni en el cumplimiento del SLA.
             */
            if (sla.waitingAssignment) {
                continue;
            }
            const tieneRespuesta = t.firstResponseAt !== null;
            const tieneCierre = t.closedAt !== null ||
                t.resolvedAt !== null;
            const estaActivo = t.status !== TicketStatus.CLOSED &&
                t.status !== TicketStatus.RESOLVED;
            // Primera respuesta
            if (tieneRespuesta || tieneCierre || estaActivo) {
                if (sla.firstResponse.status === "OK")
                    frOk++;
                if (sla.firstResponse.status === "BREACHED")
                    frBreached++;
                if (sla.firstResponse.status === "PENDING")
                    frPending++;
                frTotal++;
            }
            // Resolución
            if (tieneCierre || estaActivo) {
                if (sla.resolution.status === "OK")
                    rsOk++;
                if (sla.resolution.status === "BREACHED")
                    rsBreached++;
                if (sla.resolution.status === "PENDING")
                    rsPending++;
                rsTotal++;
            }
            // Por técnico
            if (t.assigneeId && t.assignee) {
                if (!byTechnicianMap.has(t.assigneeId)) {
                    byTechnicianMap.set(t.assigneeId, {
                        tecnicoId: t.assignee.id_tecnico,
                        tecnicoNombre: t.assignee.nombre,
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
                const stat = byTechnicianMap.get(t.assigneeId);
                stat.totalTickets++;
                if (sla.firstResponse.status === "OK")
                    stat.firstResponseOk++;
                if (sla.firstResponse.status === "BREACHED")
                    stat.firstResponseBreached++;
                if (sla.resolution.status === "OK")
                    stat.resolutionOk++;
                if (sla.resolution.status === "BREACHED")
                    stat.resolutionBreached++;
                if (sla.firstResponse.elapsedMinutes !== null) {
                    stat.firstResponseMinutesSum += sla.firstResponse.elapsedMinutes;
                    stat.firstResponseMinutesCount++;
                }
                if (sla.resolution.elapsedMinutes !== null) {
                    stat.resolutionMinutesSum += sla.resolution.elapsedMinutes;
                    stat.resolutionMinutesCount++;
                }
            }
            if (sla.firstResponse.elapsedMinutes !== null) {
                frMinutesSum += sla.firstResponse.elapsedMinutes;
                frMinutesCount++;
            }
            if (sla.resolution.elapsedMinutes !== null) {
                rsMinutesSum += sla.resolution.elapsedMinutes;
                rsMinutesCount++;
            }
        }
        const technicians = Array.from(byTechnicianMap.values()).map((t) => ({
            ...t,
            avgFirstResponseMinutes: t.firstResponseMinutesCount > 0
                ? Math.round(t.firstResponseMinutesSum / t.firstResponseMinutesCount)
                : 0,
            avgResolutionMinutes: t.resolutionMinutesCount > 0
                ? Math.round(t.resolutionMinutesSum / t.resolutionMinutesCount)
                : 0,
            firstResponseCompliance: t.totalTickets > 0
                ? Math.round((t.firstResponseOk / t.totalTickets) * 100)
                : 0,
            resolutionCompliance: t.totalTickets > 0
                ? Math.round((t.resolutionOk / t.totalTickets) * 100)
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
                    compliance: frTotal > 0 ? Math.round((frOk / frTotal) * 100) : 0,
                    avgMinutes: frMinutesCount > 0 ? Math.round(frMinutesSum / frMinutesCount) : null,
                },
                resolution: {
                    total: rsTotal,
                    ok: rsOk,
                    breached: rsBreached,
                    pending: rsPending,
                    compliance: rsTotal > 0 ? Math.round((rsOk / rsTotal) * 100) : 0,
                    avgMinutes: rsMinutesCount > 0 ? Math.round(rsMinutesSum / rsMinutesCount) : null,
                },
                byTechnician: technicians,
            },
        });
    }
    catch (error) {
        console.error("[helpdesk] SLA error:", error);
        return res.status(500).json({ ok: false, message: "Error al calcular SLA" });
    }
}
//# sourceMappingURL=ticketera-sla.controller.js.map