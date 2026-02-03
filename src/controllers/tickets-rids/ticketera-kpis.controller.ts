// src/controllers/helpdesk/tickets.kpi.controller.ts
import type { Request, Response } from "express";
import { prisma } from "../../lib/prisma.js";
import { TicketStatus } from "@prisma/client";

export async function getTicketKpis(req: Request, res: Response) {
    try {
        const empresaId = req.query.empresaId
            ? Number(req.query.empresaId)
            : undefined;

        const whereBase = {
            ...(empresaId && { empresaId }),
        };

        /* =============================
           1️⃣ Contadores básicos
        ============================= */
        const [
            total,
            open,
            pending,
            resolved,
            closed,
        ] = await Promise.all([
            prisma.ticket.count({ where: whereBase }),
            prisma.ticket.count({ where: { ...whereBase, status: TicketStatus.OPEN } }),
            prisma.ticket.count({ where: { ...whereBase, status: TicketStatus.PENDING } }),
            prisma.ticket.count({ where: { ...whereBase, status: TicketStatus.RESOLVED } }),
            prisma.ticket.count({ where: { ...whereBase, status: TicketStatus.CLOSED } }),
        ]);

        /* =============================
           2️⃣ First Response Time (FRT)
        ============================= */
        const frtTickets = await prisma.ticket.findMany({
            where: {
                ...whereBase,
                firstResponseAt: { not: null },
            },
            select: {
                createdAt: true,
                firstResponseAt: true,
            },
        });

        const frtDurations = frtTickets.map(t =>
            t.firstResponseAt!.getTime() - t.createdAt.getTime()
        );

        const avgFirstResponseMs =
            frtDurations.length > 0
                ? frtDurations.reduce((a, b) => a + b, 0) / frtDurations.length
                : 0;

        const avgFirstResponseMinutes = Math.round(
            avgFirstResponseMs / 1000 / 60
        );

        /* =============================
           3️⃣ Resolution Time
        ============================= */
        const resolvedTickets = await prisma.ticket.findMany({
            where: {
                ...whereBase,
                resolvedAt: { not: null },
            },
            select: {
                createdAt: true,
                resolvedAt: true,
            },
        });

        const resolutionDurations = resolvedTickets.map(t =>
            t.resolvedAt!.getTime() - t.createdAt.getTime()
        );

        const avgResolutionMs =
            resolutionDurations.length > 0
                ? resolutionDurations.reduce((a, b) => a + b, 0) / resolutionDurations.length
                : 0;

        const avgResolutionMinutes = Math.round(
            avgResolutionMs / 1000 / 60
        );

        /* =============================
           4️⃣ Response
        ============================= */
        return res.json({
            ok: true,
            kpis: {
                totalTickets: total,
                openTickets: open,
                pendingTickets: pending,
                resolvedTickets: resolved,
                closedTickets: closed,

                avgFirstResponseMinutes,
                avgResolutionMinutes,

                samples: {
                    firstResponse: frtDurations.length,
                    resolution: resolutionDurations.length,
                },
            }
        });
    } catch (error) {
        console.error("[helpdesk] getTicketKpis error:", error);
        return res.status(500).json({
            ok: false,
            message: "Error al calcular KPIs",
        });
    }
}

export async function getTicketKpisByAgent(req: Request, res: Response) {
    try {
        const empresaId = req.query.empresaId
            ? Number(req.query.empresaId)
            : undefined;

        const tickets = await prisma.ticket.findMany({
            where: {
                assigneeId: { not: null },
                ...(empresaId && { empresaId }),
            },
            select: {
                assigneeId: true,
                assignee: {
                    select: {
                        id_tecnico: true,
                        nombre: true,
                    },
                },
                status: true,
                createdAt: true,
                firstResponseAt: true,
                resolvedAt: true,
            },
        });

        const agentsMap = new Map<number, any>();

        for (const t of tickets) {
            const agentId = t.assigneeId!;
            const agentName = t.assignee?.nombre ?? "Sin nombre";

            if (!agentsMap.has(agentId)) {
                agentsMap.set(agentId, {
                    agentId,
                    agentName,
                    assigned: 0,
                    resolved: 0,
                    open: 0,
                    frtSamples: [] as number[],
                    resolutionSamples: [] as number[],
                });
            }

            const agent = agentsMap.get(agentId);

            agent.assigned++;

            if (t.status === TicketStatus.RESOLVED) {
                agent.resolved++;
            }

            if (
                t.status === TicketStatus.OPEN ||
                t.status === TicketStatus.PENDING
            ) {
                agent.open++;
            }

            if (t.firstResponseAt) {
                agent.frtSamples.push(
                    t.firstResponseAt.getTime() - t.createdAt.getTime()
                );
            }

            if (t.resolvedAt) {
                agent.resolutionSamples.push(
                    t.resolvedAt.getTime() - t.createdAt.getTime()
                );
            }
        }

        const kpis = Array.from(agentsMap.values()).map(agent => ({
            agentId: agent.agentId,
            agentName: agent.agentName,

            assignedTickets: agent.assigned,
            resolvedTickets: agent.resolved,
            openTickets: agent.open,

            avgFirstResponseMinutes:
                agent.frtSamples.length > 0
                    ? Math.round(
                        agent.frtSamples.reduce(
                            (a: number, b: number) => a + b,
                            0
                        ) /
                        agent.frtSamples.length /
                        1000 /
                        60
                    )
                    : 0,

            avgResolutionMinutes:
                agent.resolutionSamples.length > 0
                    ? Math.round(
                        agent.resolutionSamples.reduce(
                            (a: number, b: number) => a + b,
                            0
                        ) /
                        agent.resolutionSamples.length /
                        1000 /
                        60
                    )
                    : 0,
        }));

        return res.json({
            ok: true,
            agents: kpis,
        });
    } catch (error) {
        console.error("[helpdesk] agent KPIs error:", error);
        return res.status(500).json({
            ok: false,
            message: "Error al calcular KPIs por agente",
        });
    }
}