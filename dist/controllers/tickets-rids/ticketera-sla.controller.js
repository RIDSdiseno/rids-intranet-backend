import { prisma } from "../../lib/prisma.js";
import { TicketPriority, TicketStatus } from "@prisma/client";
export const SLA_CONFIG = {
    LOW: { firstResponseMinutes: 60, resolutionMinutes: 240 }, // 1h respuesta, 4h cierre
    NORMAL: { firstResponseMinutes: 30, resolutionMinutes: 60 }, // 30min respuesta, 1h cierre
    HIGH: { firstResponseMinutes: 15, resolutionMinutes: 30 }, // 15min respuesta, 30min cierre
    URGENT: { firstResponseMinutes: 5, resolutionMinutes: 15 }, // 5min respuesta, 15min cierre
};
function addMinutes(date, minutes) {
    return new Date(date.getTime() + minutes * 60 * 1000);
}
function diffMinutes(a, b) {
    return Math.max(0, Math.round((b.getTime() - a.getTime()) / 60000));
}
export function getSlaTargets(priority) {
    const key = String(priority || "NORMAL").toUpperCase();
    return SLA_CONFIG[key] ?? SLA_CONFIG.NORMAL;
}
// Función para construir el objeto de SLA de un ticket, con su estado (OK, BREACHED, PENDING) y minutos restantes o transcurridos
export function buildTicketSla(ticket) {
    const now = new Date();
    const createdAt = new Date(ticket.createdAt);
    const targets = getSlaTargets(ticket.priority);
    const firstResponseDueAt = addMinutes(createdAt, targets.firstResponseMinutes);
    const resolutionDueAt = addMinutes(createdAt, targets.resolutionMinutes);
    const firstResponseAt = ticket.firstResponseAt ? new Date(ticket.firstResponseAt) : null;
    const resolutionEndAt = ticket.closedAt ? new Date(ticket.closedAt) : null;
    // ── Primera respuesta ──────────────────────────────────────────────────────
    let firstResponseStatus = "PENDING";
    if (firstResponseAt) {
        // Respondido: OK si llegó a tiempo, BREACHED si tardó
        firstResponseStatus = firstResponseAt <= firstResponseDueAt ? "OK" : "BREACHED";
    }
    else if (now > firstResponseDueAt) {
        // Plazo vencido sin respuesta:
        // Si el ticket ya está cerrado/resuelto sin dato de firstResponseAt,
        // lo contamos como OK (beneficio de la duda — dato no registrado).
        // Si está activo, es un incumplimiento real.
        const isTerminated = ticket.status === TicketStatus.CLOSED ||
            ticket.status === TicketStatus.RESOLVED;
        firstResponseStatus = isTerminated ? "OK" : "BREACHED";
    }
    // ── Resolución ────────────────────────────────────────────────────────────
    let resolutionStatus = "PENDING";
    if (resolutionEndAt) {
        // Cerrado: OK si llegó a tiempo, BREACHED si tardó
        resolutionStatus = resolutionEndAt <= resolutionDueAt ? "OK" : "BREACHED";
    }
    else {
        const isTerminated = ticket.status === TicketStatus.CLOSED ||
            ticket.status === TicketStatus.RESOLVED;
        if (isTerminated) {
            // Cerrado/resuelto sin closedAt registrado → OK (dato faltante)
            resolutionStatus = "OK";
        }
        else if (now > resolutionDueAt) {
            // Activo y plazo vencido → incumplimiento real
            resolutionStatus = "BREACHED";
        }
        // else: plazo aún vigente → PENDING (valor inicial)
    }
    // Construimos el objeto SLA con targets, tiempos y estados para primera respuesta y resolución
    return {
        targets,
        firstResponse: {
            dueAt: firstResponseDueAt,
            at: firstResponseAt,
            elapsedMinutes: firstResponseAt ? diffMinutes(createdAt, firstResponseAt) : null,
            status: firstResponseStatus,
            remainingMinutes: firstResponseAt
                ? 0
                : diffMinutes(now, firstResponseDueAt) * -1,
        },
        resolution: {
            dueAt: resolutionDueAt,
            at: resolutionEndAt,
            elapsedMinutes: resolutionEndAt ? diffMinutes(createdAt, resolutionEndAt) : null,
            status: resolutionStatus,
            remainingMinutes: resolutionEndAt
                ? 0
                : diffMinutes(now, resolutionDueAt) * -1,
        },
    };
}
// Endpoint para obtener métricas de SLA de los tickets, con opción de filtrar por empresa y rango de fechas
export async function getTicketSla(req, res) {
    try {
        const empresaId = req.query.empresaId
            ? Number(req.query.empresaId)
            : undefined;
        // ✅ Leer rango de fechas enviado por el frontend
        const from = req.query.from ? new Date(req.query.from) : undefined;
        const to = req.query.to ? new Date(req.query.to) : undefined;
        const tickets = await prisma.ticket.findMany({
            where: {
                ...(empresaId && { empresaId }),
                // ✅ Filtrar por rango de fechas si el frontend lo envía
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
        // Recorremos los tickets para calcular el estado de SLA de cada uno y acumular métricas generales y por técnico
        for (const t of tickets) {
            const sla = buildTicketSla(t);
            // Primera respuesta
            const tieneRespuesta = t.firstResponseAt !== null;
            const estaActivo = t.status !== TicketStatus.CLOSED && t.status !== TicketStatus.RESOLVED;
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
            const tieneCierre = t.closedAt !== null;
            if (tieneCierre || estaActivo) {
                if (sla.resolution.status === "OK")
                    rsOk++;
                if (sla.resolution.status === "BREACHED")
                    rsBreached++;
                if (sla.resolution.status === "PENDING")
                    rsPending++;
                rsTotal++;
            }
            // Por técnico asignado
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
        // Calculamos métricas generales de SLA y formateamos el resultado por técnico, incluyendo cumplimiento y tiempos promedio de respuesta y resolución
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
        // Devolvemos la respuesta con las métricas de SLA generales y por técnico
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
        return res.status(500).json({
            ok: false,
            message: "Error al calcular SLA",
        });
    }
}
//# sourceMappingURL=ticketera-sla.controller.js.map