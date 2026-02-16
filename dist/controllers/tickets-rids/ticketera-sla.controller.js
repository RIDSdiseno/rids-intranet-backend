import { prisma } from "../../lib/prisma.js";
import { TicketStatus } from "@prisma/client";
const SLA = {
    FIRST_RESPONSE_MINUTES: 30, // 30 min
    RESOLUTION_MINUTES: 8 * 60, // 8 horas
};
function diffMinutes(a, b) {
    return Math.round((b.getTime() - a.getTime()) / 1000 / 60);
}
export async function getTicketSla(req, res) {
    try {
        const empresaId = req.query.empresaId
            ? Number(req.query.empresaId)
            : undefined;
        const tickets = await prisma.ticket.findMany({
            where: {
                ...(empresaId && { empresaId }),
            },
            select: {
                createdAt: true,
                firstResponseAt: true,
                resolvedAt: true,
                status: true,
            },
        });
        let frtTotal = 0;
        let frtOk = 0;
        let frtBreached = 0;
        let resTotal = 0;
        let resOk = 0;
        let resBreached = 0;
        for (const t of tickets) {
            /* ==========================
               SLA First Response
            ========================== */
            if (t.firstResponseAt) {
                frtTotal++;
                const minutes = diffMinutes(t.createdAt, t.firstResponseAt);
                if (minutes <= SLA.FIRST_RESPONSE_MINUTES) {
                    frtOk++;
                }
                else {
                    frtBreached++;
                }
            }
            /* ==========================
               SLA Resolution
            ========================== */
            if (t.resolvedAt) {
                resTotal++;
                const minutes = diffMinutes(t.createdAt, t.resolvedAt);
                if (minutes <= SLA.RESOLUTION_MINUTES) {
                    resOk++;
                }
                else {
                    resBreached++;
                }
            }
        }
        return res.json({
            ok: true,
            sla: {
                firstResponse: {
                    targetMinutes: SLA.FIRST_RESPONSE_MINUTES,
                    total: frtTotal,
                    ok: frtOk,
                    breached: frtBreached,
                    compliance: frtTotal > 0
                        ? Math.round((frtOk / frtTotal) * 100)
                        : 0,
                },
                resolution: {
                    targetMinutes: SLA.RESOLUTION_MINUTES,
                    total: resTotal,
                    ok: resOk,
                    breached: resBreached,
                    compliance: resTotal > 0
                        ? Math.round((resOk / resTotal) * 100)
                        : 0,
                },
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