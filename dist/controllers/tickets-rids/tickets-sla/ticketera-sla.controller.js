import { prisma } from "../../../lib/prisma.js";
import { TicketPriority, TicketStatus } from "@prisma/client";
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
function diffMinutes(a, b) {
    return Math.max(0, Math.round((b.getTime() - a.getTime()) / 60000));
}
export function buildTicketSla(ticket, slaConfig) {
    const now = new Date();
    const createdAt = new Date(ticket.createdAt);
    const targets = getSlaTargets(ticket.priority, slaConfig);
    const firstResponseStartAt = createdAt;
    const resolutionStartAt = ticket.lastReopenedAt
        ? new Date(ticket.lastReopenedAt)
        : createdAt;
    const firstResponseDueAt = addMinutes(firstResponseStartAt, targets.firstResponseMinutes);
    const resolutionDueAt = addMinutes(resolutionStartAt, targets.resolutionMinutes);
    const firstResponseAt = ticket.firstResponseAt ? new Date(ticket.firstResponseAt) : null;
    const resolutionEndAt = ticket.closedAt
        ? new Date(ticket.closedAt)
        : ticket.resolvedAt
            ? new Date(ticket.resolvedAt)
            : null;
    // ── Primera respuesta ─────────────────────────────────────────────────────
    let firstResponseStatus = "PENDING";
    if (firstResponseAt) {
        firstResponseStatus = firstResponseAt <= firstResponseDueAt ? "OK" : "BREACHED";
    }
    else if (now > firstResponseDueAt) {
        const isTerminated = ticket.status === TicketStatus.CLOSED ||
            ticket.status === TicketStatus.RESOLVED;
        firstResponseStatus = isTerminated ? "OK" : "BREACHED";
    }
    // ── Resolución ────────────────────────────────────────────────────────────
    let resolutionStatus = "PENDING";
    if (resolutionEndAt) {
        resolutionStatus = resolutionEndAt <= resolutionDueAt ? "OK" : "BREACHED";
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
        firstResponse: {
            dueAt: firstResponseDueAt,
            at: firstResponseAt,
            elapsedMinutes: firstResponseAt
                ? diffMinutes(firstResponseStartAt, firstResponseAt)
                : null,
            status: firstResponseStatus,
            remainingMinutes: firstResponseAt
                ? 0
                : diffMinutes(now, firstResponseDueAt) * -1,
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
                : diffMinutes(now, resolutionDueAt) * -1,
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
                ...(empresaId && { empresaId }),
                ...(from || to ? {
                    createdAt: {
                        ...(from && { gte: from }),
                        ...(to && { lte: to }),
                    },
                } : {}),
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
            },
        });
        let frTotal = 0, frOk = 0, frBreached = 0, frPending = 0;
        let rsTotal = 0, rsOk = 0, rsBreached = 0, rsPending = 0;
        let frMinutesSum = 0, frMinutesCount = 0;
        let rsMinutesSum = 0, rsMinutesCount = 0;
        const byTechnicianMap = new Map();
        for (const t of tickets) {
            const sla = buildTicketSla(t, slaConfig);
            const tieneRespuesta = t.firstResponseAt !== null;
            const tieneCierre = t.closedAt !== null || t.resolvedAt !== null;
            const estaActivo = t.status !== TicketStatus.CLOSED &&
                t.status !== TicketStatus.RESOLVED;
            // Primera respuesta
            if (tieneRespuesta || estaActivo) {
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