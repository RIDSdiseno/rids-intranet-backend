// src/controllers/helpdesk/dashboard.controller.ts
import type { Request, Response } from "express";
import { prisma } from "../../lib/prisma.js";
import { TicketStatus } from "@prisma/client";

export async function getAgentDashboard(req: Request, res: Response) {
    try {
        const agentId = req.user?.id;

        if (!agentId) {
            return res.status(401).json({ ok: false, message: "No autorizado" });
        }

        const [
            newCount,
            openCount,
            onHoldCount,
            assignedToMe,
        ] = await Promise.all([
            prisma.ticket.count({ where: { status: TicketStatus.NEW } }),
            prisma.ticket.count({ where: { status: TicketStatus.OPEN } }),
            prisma.ticket.count({ where: { status: TicketStatus.ON_HOLD } }),
            prisma.ticket.count({
                where: { assigneeId: agentId },
            }),
        ]);

        return res.json({
            ok: true,
            stats: {
                new: newCount,
                open: openCount,
                onHold: onHoldCount,
                assignedToMe,
            },
        });
    } catch (error) {
        console.error("[helpdesk] dashboard error:", error);
        return res.status(500).json({
            ok: false,
            message: "Error al cargar dashboard",
        });
    }
}
