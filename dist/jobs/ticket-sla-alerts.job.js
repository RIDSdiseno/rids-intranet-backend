import { prisma } from "../lib/prisma.js";
import { TicketStatus } from "@prisma/client";
import { getSlaConfigFromDB } from "../config/sla.config.js";
import { buildTicketSla } from "../controllers/tickets-rids/tickets-sla/ticketera-sla.controller.js";
import { sendTicketSlaAlertEmail } from "../controllers/tickets-rids/tickets-sla/ticket-sla-alert-mailer.js";
import { bus } from "../lib/events.js";
const ALERT_BEFORE_MINUTES = 15;
export async function runTicketSlaAlertsJob() {
    try {
        const slaConfig = await getSlaConfigFromDB();
        const tickets = await prisma.ticket.findMany({
            where: {
                assigneeId: { not: null },
                status: {
                    in: [TicketStatus.NEW, TicketStatus.OPEN, TicketStatus.PENDING, TicketStatus.ON_HOLD],
                },
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
            },
        });
        for (const ticket of tickets) {
            if (!ticket.assigneeId || !ticket.assignee)
                continue;
            const sla = buildTicketSla(ticket, slaConfig);
            const firstResponseRemaining = sla.firstResponse.remainingMinutes ?? 0;
            const resolutionRemaining = sla.resolution.remainingMinutes ?? 0;
            const firstResponseBreached = sla.firstResponse.status === "BREACHED";
            const resolutionBreached = sla.resolution.status === "BREACHED";
            const firstResponseSoon = sla.firstResponse.status === "PENDING" &&
                Math.abs(firstResponseRemaining) <= ALERT_BEFORE_MINUTES &&
                firstResponseRemaining < 0;
            const resolutionSoon = sla.resolution.status === "PENDING" &&
                Math.abs(resolutionRemaining) <= ALERT_BEFORE_MINUTES &&
                resolutionRemaining < 0;
            const alertsToSend = [];
            if (firstResponseBreached) {
                alertsToSend.push({ alertType: "FIRST_RESPONSE_BREACHED" });
            }
            else if (firstResponseSoon) {
                alertsToSend.push({ alertType: "FIRST_RESPONSE_SOON" });
            }
            if (resolutionBreached) {
                alertsToSend.push({ alertType: "RESOLUTION_BREACHED" });
            }
            else if (resolutionSoon) {
                alertsToSend.push({ alertType: "RESOLUTION_SOON" });
            }
            for (const alert of alertsToSend) {
                const alreadySent = await prisma.ticketSlaAlertLog.findUnique({
                    where: {
                        ticketId_alertType: {
                            ticketId: ticket.id,
                            alertType: alert.alertType,
                        },
                    },
                });
                if (alreadySent)
                    continue;
                bus.emit("ticket.sla_alert", {
                    ticketId: ticket.id,
                    subject: ticket.subject,
                    assigneeId: ticket.assignee.id_tecnico,
                    assigneeName: ticket.assignee.nombre,
                    firstResponseStatus: sla.firstResponse.status,
                    resolutionStatus: sla.resolution.status,
                    firstResponseRemaining,
                    resolutionRemaining,
                    alertType: alert.alertType,
                });
                if (ticket.assignee.email &&
                    (alert.alertType === "FIRST_RESPONSE_BREACHED" ||
                        alert.alertType === "RESOLUTION_BREACHED" ||
                        alert.alertType === "FIRST_RESPONSE_SOON" ||
                        alert.alertType === "RESOLUTION_SOON")) {
                    console.log(`[ticket-sla-alerts] enviando correo ${alert.alertType} para ticket #${ticket.id} a ${ticket.assignee.email}`);
                    await sendTicketSlaAlertEmail({
                        to: ticket.assignee.email,
                        tecnicoNombre: ticket.assignee.nombre,
                        ticketId: ticket.id,
                        subject: ticket.subject,
                        priority: String(ticket.priority),
                        status: String(ticket.status),
                        alertType: alert.alertType,
                        firstResponseRemaining,
                        resolutionRemaining,
                    });
                    console.log(`[ticket-sla-alerts] correo enviado ${alert.alertType} para ticket #${ticket.id}`);
                }
                await prisma.ticketSlaAlertLog.create({
                    data: {
                        ticketId: ticket.id,
                        alertType: alert.alertType,
                    },
                });
            }
        }
    }
    catch (error) {
        console.error("[ticket-sla-alerts] error:", error);
    }
}
//# sourceMappingURL=ticket-sla-alerts.job.js.map