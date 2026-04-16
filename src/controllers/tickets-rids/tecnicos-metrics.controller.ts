import type { Request, Response } from "express";
import { prisma } from "../../lib/prisma.js";
import { TicketStatus } from "@prisma/client";
import { buildTicketSla } from "../tickets-rids/tickets-sla/ticketera-sla.controller.js";
import { getSlaConfigFromDB } from "../../config/sla.config.js";

export async function getTicketMetricsByTecnico(req: Request, res: Response) {
    try {
        const empresaId = req.query.empresaId
            ? Number(req.query.empresaId)
            : undefined;

        const tecnicoId = req.query.tecnicoId
            ? Number(req.query.tecnicoId)
            : undefined;

        const from = req.query.from ? new Date(req.query.from as string) : undefined;
        const to = req.query.to ? new Date(req.query.to as string) : undefined;

        // ✅ Resolver config SLA una sola vez antes del loop
        const slaConfig = await getSlaConfigFromDB();

        const tickets = await prisma.ticket.findMany({
            where: {
                assigneeId: tecnicoId ? tecnicoId : { not: null },
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
                subject: true,
                status: true,
                priority: true,
                createdAt: true,
                firstResponseAt: true,
                resolvedAt: true,
                closedAt: true,
                assigneeId: true,
                assignee: {
                    select: {
                        id_tecnico: true,
                        nombre: true,
                        email: true,
                    },
                },
                events: {
                    select: { type: true },
                },
            },
            orderBy: { createdAt: "desc" },
        });

        const byTecnico = new Map<number, any>();

        for (const ticket of tickets) {
            if (!ticket.assigneeId || !ticket.assignee) continue;

            const key = ticket.assigneeId;

            if (!byTecnico.has(key)) {
                byTecnico.set(key, {
                    tecnicoId: ticket.assignee.id_tecnico,
                    nombre: ticket.assignee.nombre,
                    email: ticket.assignee.email,
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

            const row = byTecnico.get(key);

            // ✅ Pasar slaConfig como segundo argumento
            const sla = buildTicketSla(ticket, slaConfig);

            row.assignedTickets++;

            if (ticket.status === TicketStatus.NEW || ticket.status === TicketStatus.OPEN) {
                row.openTickets++;
            }
            if (ticket.status === TicketStatus.PENDING || ticket.status === TicketStatus.ON_HOLD) {
                row.pendingTickets++;
            }
            if (ticket.status === TicketStatus.RESOLVED) row.resolvedTickets++;
            if (ticket.status === TicketStatus.CLOSED) row.closedTickets++;

            if (ticket.events?.some((e) => e.type === "REOPENED")) {
                row.reopenedTickets++;
            }

            if (sla.firstResponse.status === "OK") row.firstResponseOk++;
            if (sla.firstResponse.status === "BREACHED") row.firstResponseBreached++;
            if (sla.firstResponse.status === "PENDING") row.firstResponsePending++;

            if (sla.resolution.status === "OK") row.resolutionOk++;
            if (sla.resolution.status === "BREACHED") row.resolutionBreached++;
            if (sla.resolution.status === "PENDING") row.resolutionPending++;

            if (sla.firstResponse.elapsedMinutes !== null) {
                row.firstResponseMinutesSum += sla.firstResponse.elapsedMinutes;
                row.firstResponseMinutesCount++;
            }
            if (sla.resolution.elapsedMinutes !== null) {
                row.resolutionMinutesSum += sla.resolution.elapsedMinutes;
                row.resolutionMinutesCount++;
            }
        }

        const data = Array.from(byTecnico.values()).map((row) => {
            const firstResponseTotal =
                row.firstResponseOk + row.firstResponseBreached + row.firstResponsePending;
            const resolutionTotal =
                row.resolutionOk + row.resolutionBreached + row.resolutionPending;

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

                avgFirstResponseMinutes:
                    row.firstResponseMinutesCount > 0
                        ? Math.round(row.firstResponseMinutesSum / row.firstResponseMinutesCount)
                        : null,

                avgResolutionMinutes:
                    row.resolutionMinutesCount > 0
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
        });

        return res.json({ ok: true, data });

    } catch (error) {
        console.error("[helpdesk] getTicketMetricsByTecnico error:", error);
        return res.status(500).json({
            ok: false,
            message: "Error al obtener métricas por técnico",
        });
    }
}