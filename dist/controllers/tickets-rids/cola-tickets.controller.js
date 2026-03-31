import { prisma } from "../../lib/prisma.js";
import { TicketStatus, MessageDirection } from "@prisma/client";
const SLA = {
    FIRST_RESPONSE_MINUTES: 30, // 30 min
    RESOLUTION_MINUTES: 8 * 60, // 8 horas
};
function isSlaBreached(createdAt, firstResponseAt) {
    if (!firstResponseAt) {
        const now = new Date();
        const minutes = (now.getTime() - createdAt.getTime()) / 1000 / 60;
        return minutes > SLA.FIRST_RESPONSE_MINUTES;
    }
    return false;
}
export async function getTicketQueues(req, res) {
    try {
        const agentId = req.user?.id;
        if (!agentId) {
            return res.status(401).json({ ok: false, message: "No autorizado" });
        }
        // 1️⃣ Conteos simples (rápidos)
        const [unassigned, newTickets, openTickets, myTickets,] = await Promise.all([
            prisma.ticket.count({
                where: { assigneeId: null },
            }),
            prisma.ticket.count({
                where: { status: TicketStatus.NEW },
            }),
            prisma.ticket.count({
                where: { status: TicketStatus.OPEN },
            }),
            prisma.ticket.count({
                where: { assigneeId: agentId },
            }),
        ]);
        // 2️⃣ SLA breached (requiere lógica)
        const pendingTickets = await prisma.ticket.findMany({
            where: {
                status: {
                    in: [TicketStatus.NEW, TicketStatus.OPEN],
                },
            },
            select: {
                createdAt: true,
                firstResponseAt: true,
            },
        });
        const slaBreached = pendingTickets.filter(t => isSlaBreached(t.createdAt, t.firstResponseAt)).length;
        // 3️⃣ Waiting customer (último mensaje OUTBOUND)
        const waitingCustomer = await prisma.ticket.count({
            where: {
                messages: {
                    some: {
                        direction: MessageDirection.OUTBOUND,
                    },
                },
                status: TicketStatus.OPEN,
            },
        });
        return res.json({
            ok: true,
            queues: {
                unassigned,
                new: newTickets,
                open: openTickets,
                myTickets,
                waitingCustomer,
                slaBreached,
            },
        });
    }
    catch (error) {
        console.error("[helpdesk] queues error:", error);
        return res.status(500).json({
            ok: false,
            message: "Error al cargar colas",
        });
    }
}
//# sourceMappingURL=cola-tickets.controller.js.map