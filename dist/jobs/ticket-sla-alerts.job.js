import { Prisma, TicketEventType, TicketStatus, } from "@prisma/client";
import { prisma, } from "../lib/prisma.js";
import { getSlaConfigFromDB, } from "../config/sla.config.js";
import { buildTicketSla, } from "../controllers/tickets-rids/tickets-sla/ticketera-sla.controller.js";
import { sendTicketSlaAlertEmail, } from "../controllers/tickets-rids/tickets-sla/ticket-sla-alert-mailer.js";
const ALERT_BEFORE_MINUTES = 15;
export async function runTicketSlaAlertsJob() {
    try {
        const slaConfig = await getSlaConfigFromDB();
        const tickets = await prisma.ticket.findMany({
            where: {
                deletedAt: null,
                assigneeId: {
                    not: null,
                },
                status: {
                    in: [
                        TicketStatus.NEW,
                        TicketStatus.OPEN,
                        TicketStatus.PENDING,
                        TicketStatus.ON_HOLD,
                    ],
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
                lastReopenedAt: true,
                /*
                 * Necesario para que cada reapertura
                 * pueda generar nuevamente sus alertas.
                 */
                slaCycleNumber: true,
                assigneeId: true,
                assignee: {
                    select: {
                        id_tecnico: true,
                        nombre: true,
                        email: true,
                    },
                },
                /*
                 * buildTicketSla necesita estos eventos:
                 *
                 * ASSIGNED:
                 * determina cuándo comienza el SLA.
                 *
                 * STATUS_CHANGED:
                 * permite calcular las pausas PENDING.
                 *
                 * REOPENED:
                 * se mantiene disponible para reconstrucción
                 * y auditoría del ciclo.
                 */
                events: {
                    where: {
                        type: {
                            in: [
                                TicketEventType.ASSIGNED,
                                TicketEventType.STATUS_CHANGED,
                                TicketEventType.REOPENED,
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
        for (const ticket of tickets) {
            /*
             * En teoría Prisma ya garantiza assigneeId
             * por el WHERE, pero mantenemos esta protección.
             */
            if (!ticket.assigneeId ||
                !ticket.assignee) {
                continue;
            }
            const sla = buildTicketSla(ticket, slaConfig);
            /*
             * Un ticket sin una asignación SLA válida
             * todavía no genera alertas.
             */
            if (sla.waitingAssignment) {
                continue;
            }
            /*
             * Mientras está PENDING el SLA está pausado.
             *
             * No queremos generar alertas nuevas mientras
             * permanece pausado.
             */
            if (sla.paused) {
                continue;
            }
            const firstResponseRemaining = sla.firstResponse
                .remainingMinutes;
            const resolutionRemaining = sla.resolution
                .remainingMinutes;
            /*
             * =================================================
             * PRIMERA RESPUESTA
             * =================================================
             */
            const firstResponseBreached = sla.firstResponse.status ===
                "BREACHED";
            /*
             * remainingMinutes:
             *
             * 15  → quedan 15 minutos.
             * 5   → quedan 5 minutos.
             * 0   → vence ahora.
             * -5  → venció hace 5 minutos.
             *
             * Por eso la alerta SOON debe usar >= 0.
             */
            const firstResponseSoon = sla.firstResponse.status ===
                "PENDING" &&
                firstResponseRemaining !==
                    null &&
                firstResponseRemaining >=
                    0 &&
                firstResponseRemaining <=
                    ALERT_BEFORE_MINUTES;
            /*
             * =================================================
             * RESOLUCIÓN
             * =================================================
             */
            const resolutionBreached = sla.resolution.status ===
                "BREACHED";
            const resolutionSoon = sla.resolution.status ===
                "PENDING" &&
                resolutionRemaining !==
                    null &&
                resolutionRemaining >=
                    0 &&
                resolutionRemaining <=
                    ALERT_BEFORE_MINUTES;
            const alertsToSend = [];
            /*
             * =================================================
             * ALERTA PRIMERA RESPUESTA
             * =================================================
             */
            if (firstResponseBreached) {
                alertsToSend.push({
                    alertType: "FIRST_RESPONSE_BREACHED",
                });
            }
            else if (firstResponseSoon) {
                alertsToSend.push({
                    alertType: "FIRST_RESPONSE_SOON",
                });
            }
            /*
             * =================================================
             * ALERTA RESOLUCIÓN
             * =================================================
             */
            if (resolutionBreached) {
                alertsToSend.push({
                    alertType: "RESOLUTION_BREACHED",
                });
            }
            else if (resolutionSoon) {
                alertsToSend.push({
                    alertType: "RESOLUTION_SOON",
                });
            }
            /*
             * =================================================
             * PROCESAR ALERTAS
             * =================================================
             */
            for (const alert of alertsToSend) {
                /*
                 * =================================================
                 * DEDUPE POR CICLO SLA
                 * =================================================
                 *
                 * Ticket #100:
                 *
                 * ciclo 1 / FIRST_RESPONSE_SOON
                 * ciclo 2 / FIRST_RESPONSE_SOON
                 *
                 * son alertas distintas.
                 */
                const alreadySent = await prisma
                    .ticketSlaAlertLog
                    .findUnique({
                    where: {
                        ticketId_cycleNumber_alertType: {
                            ticketId: ticket.id,
                            cycleNumber: ticket
                                .slaCycleNumber,
                            alertType: alert
                                .alertType,
                        },
                    },
                });
                if (alreadySent) {
                    continue;
                }
                /*
                 * =================================================
                 * RESERVAR ALERTA
                 * =================================================
                 *
                 * La guardamos antes de enviarla para evitar
                 * que dos ejecuciones simultáneas del job
                 * envíen dos veces la misma alerta.
                 */
                try {
                    await prisma
                        .ticketSlaAlertLog
                        .create({
                        data: {
                            ticketId: ticket.id,
                            cycleNumber: ticket
                                .slaCycleNumber,
                            alertType: alert
                                .alertType,
                        },
                    });
                }
                catch (error) {
                    /*
                     * Si otra instancia del job creó
                     * exactamente la misma alerta,
                     * la restricción UNIQUE genera P2002.
                     *
                     * En ese caso simplemente continuamos.
                     */
                    if (error instanceof
                        Prisma
                            .PrismaClientKnownRequestError &&
                        error.code ===
                            "P2002") {
                        continue;
                    }
                    throw error;
                }
                try {
                    console.log(`[ticket-sla-alerts] procesando ${alert.alertType} para ticket #${ticket.id}, ciclo SLA #${ticket.slaCycleNumber}`);
                    /*
                     * IMPORTANTE:
                     *
                     * Llamamos siempre al mailer aunque no exista
                     * correo del técnico.
                     *
                     * sendTicketSlaAlertEmail primero genera el
                     * recordatorio interno para TODOS los técnicos
                     * y luego comprueba si puede enviar el correo.
                     */
                    await sendTicketSlaAlertEmail({
                        to: ticket.assignee
                            .email ??
                            "",
                        tecnicoNombre: ticket.assignee
                            .nombre,
                        ticketId: ticket.id,
                        cycleNumber: ticket
                            .slaCycleNumber,
                        subject: ticket.subject,
                        priority: String(ticket.priority),
                        status: String(ticket.status),
                        alertType: alert.alertType,
                        firstResponseRemaining: firstResponseRemaining,
                        resolutionRemaining: resolutionRemaining,
                    });
                    console.log(`[ticket-sla-alerts] alerta procesada ${alert.alertType} para ticket #${ticket.id}, ciclo SLA #${ticket.slaCycleNumber}`);
                }
                catch (error) {
                    console.error(`[ticket-sla-alerts] error enviando ${alert.alertType} para ticket #${ticket.id}, ciclo #${ticket.slaCycleNumber}:`, error);
                    /*
                     * Si falló completamente el procesamiento,
                     * eliminamos la reserva para permitir que
                     * el próximo ciclo del job vuelva a intentar.
                     */
                    await prisma
                        .ticketSlaAlertLog
                        .deleteMany({
                        where: {
                            ticketId: ticket.id,
                            cycleNumber: ticket
                                .slaCycleNumber,
                            alertType: alert
                                .alertType,
                        },
                    });
                    /*
                     * No detenemos el job completo.
                     * Seguimos con los demás tickets.
                     */
                    continue;
                }
            }
        }
    }
    catch (error) {
        console.error("[ticket-sla-alerts] error:", error);
    }
}
//# sourceMappingURL=ticket-sla-alerts.job.js.map