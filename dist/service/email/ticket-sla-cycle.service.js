import { prisma, } from "../../lib/prisma.js";
import { buildTicketSla, } from "../../controllers/tickets-rids/tickets-sla/ticketera-sla.controller.js";
import { getSlaConfigFromDB, } from "../../config/sla.config.js";
export async function archiveCurrentSlaCycle(tx, ticket) {
    /*
     * Solo tiene sentido archivar ciclos
     * finalizados.
     */
    if (ticket.status !== "CLOSED" &&
        ticket.status !== "RESOLVED") {
        return;
    }
    const slaConfig = await getSlaConfigFromDB();
    const sla = buildTicketSla(ticket, slaConfig);
    /*
     * Si nunca hubo una asignación válida,
     * este ciclo realmente no tuvo SLA.
     */
    if (sla.waitingAssignment ||
        !sla.startsAt) {
        return;
    }
    const endedAt = ticket.closedAt ??
        ticket.resolvedAt;
    if (!endedAt) {
        return;
    }
    /*
     * Upsert hace esta operación idempotente.
     *
     * Incluso si por algún motivo dos procesos
     * intentaran archivar el mismo ciclo,
     * no tendremos duplicados.
     */
    await tx.ticketSlaCycle.upsert({
        where: {
            ticketId_cycleNumber: {
                ticketId: ticket.id,
                cycleNumber: ticket.slaCycleNumber,
            },
        },
        create: {
            ticketId: ticket.id,
            cycleNumber: ticket.slaCycleNumber,
            assigneeId: ticket.assigneeId,
            startedAt: sla.startsAt,
            endedAt,
            firstResponseAt: sla.firstResponse.at,
            resolutionAt: sla.resolution.at,
            firstResponseTargetMinutes: sla.targets
                .firstResponseMinutes,
            resolutionTargetMinutes: sla.targets
                .resolutionMinutes,
            firstResponseStatus: sla.firstResponse.status,
            resolutionStatus: sla.resolution.status,
            firstResponseElapsedMinutes: sla.firstResponse
                .elapsedMinutes,
            resolutionElapsedMinutes: sla.resolution
                .elapsedMinutes,
        },
        update: {
            assigneeId: ticket.assigneeId,
            startedAt: sla.startsAt,
            endedAt,
            firstResponseAt: sla.firstResponse.at,
            resolutionAt: sla.resolution.at,
            firstResponseTargetMinutes: sla.targets
                .firstResponseMinutes,
            resolutionTargetMinutes: sla.targets
                .resolutionMinutes,
            firstResponseStatus: sla.firstResponse.status,
            resolutionStatus: sla.resolution.status,
            firstResponseElapsedMinutes: sla.firstResponse
                .elapsedMinutes,
            resolutionElapsedMinutes: sla.resolution
                .elapsedMinutes,
        },
    });
}
//# sourceMappingURL=ticket-sla-cycle.service.js.map