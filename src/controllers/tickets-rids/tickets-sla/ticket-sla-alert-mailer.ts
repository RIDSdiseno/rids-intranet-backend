// src/controllers/tickets-rids/tickets-sla/ticket-sla-alert-mailer.ts
import { graphReaderService } from "../../../service/email/graph-reader.service.js";
import { prisma } from "../../../lib/prisma.js";

import {
    sincronizarRecordatorioTicketParaTodos,
} from "../../../service/recordatorios/recordatorios.service.js";

import { bus } from "../../../lib/events.js";

type TicketSlaAlertEmailParams = {
    to: string;
    tecnicoNombre?: string | null;
    ticketId: number;
    subject: string;
    priority: string;
    status: string;
    alertType:
    | "FIRST_RESPONSE_SOON"
    | "FIRST_RESPONSE_BREACHED"
    | "RESOLUTION_SOON"
    | "RESOLUTION_BREACHED";
    firstResponseRemaining?: number | null;
    resolutionRemaining?: number | null;
};

function getAlertTitle(alertType: TicketSlaAlertEmailParams["alertType"]) {
    switch (alertType) {
        case "FIRST_RESPONSE_SOON":
            return "Alerta preventiva: SLA de 1ra respuesta próximo a vencer";
        case "FIRST_RESPONSE_BREACHED":
            return "Alerta: SLA de 1ra respuesta vencido";
        case "RESOLUTION_SOON":
            return "Alerta preventiva: SLA de cierre próximo a vencer";
        case "RESOLUTION_BREACHED":
            return "Alerta: SLA de cierre vencido";
        default:
            return "Alerta SLA";
    }
}

function formatRemaining(minutes?: number | null) {
    if (minutes == null) return "—";
    if (minutes < 0) return `Vencido hace ${Math.abs(minutes)} min`;
    if (minutes < 60) return `${minutes} min`;
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

// Evita que textos como asunto, empresa o solicitante rompan el HTML del correo.
function escapeHtml(value?: string | null) {
    return String(value ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

async function crearRecordatorioInternoSla(
    params: TicketSlaAlertEmailParams
) {
    const ticket = await prisma.ticket.findUnique({
        where: {
            id: params.ticketId,
        },
        select: {
            id: true,
            subject: true,
        },
    });

    /*
     * Si el ticket no existe, no creamos recordatorio interno.
     *
     * No validamos assigneeId aquí porque el recordatorio interno
     * debe ser visible para todos los técnicos internos.
     */
    if (!ticket) {
        console.warn(
            "⏭️ No se crea recordatorio SLA: ticket no encontrado",
            {
                ticketId: params.ticketId,
                alertType: params.alertType,
            }
        );

        return;
    }

    const title =
        getAlertTitle(params.alertType);

    const descripcion =
        [
            `Ticket #${params.ticketId}: ${params.subject}`,
            `Prioridad: ${params.priority}`,
            `Estado: ${params.status}`,
            `Alerta: ${title}`,
            `Tiempo restante 1ra respuesta: ${formatRemaining(params.firstResponseRemaining)}`,
            `Tiempo restante cierre: ${formatRemaining(params.resolutionRemaining)}`,
        ].join("\n");

    /*
     * Programamos el recordatorio para ahora,
     * para que aparezca inmediatamente en la campana.
     */
    await sincronizarRecordatorioTicketParaTodos({
        ticketId:
            params.ticketId,

        titulo:
            `[SLA] ${title} #${params.ticketId}`,

        descripcion,

        recordatorioAt:
            new Date(Date.now() - 1000),
    });

    /*
     * Emitimos evento para que la campana global
     * se actualice inmediatamente y pueda sonar.
     */
    bus.emit("ticket.sla_alert", {
        ticketId:
            params.ticketId,

        alertType:
            params.alertType,
    });
}

export async function sendTicketSlaAlertEmail(params: TicketSlaAlertEmailParams) {
    const title = getAlertTitle(params.alertType);

    const bodyHtml = `
        <div style="font-family: Arial, sans-serif; color: #111827; line-height: 1.5;">
            <p>Hola ${escapeHtml(params.tecnicoNombre || "técnico")},</p>

            <p>
                Se detectó una alerta SLA en un ticket asignado a ti.
            </p>

            <div style="margin: 16px 0; padding: 16px; border: 1px solid #e5e7eb; border-radius: 10px; background: #f9fafb;">
                <p style="margin: 0 0 8px;"><strong>Ticket:</strong> #${params.ticketId}</p>
                <p style="margin: 0 0 8px;"><strong>Asunto:</strong> ${escapeHtml(params.subject)}</p>
                <p style="margin: 0 0 8px;"><strong>Prioridad:</strong> ${escapeHtml(params.priority)}</p>
                <p style="margin: 0 0 8px;"><strong>Estado:</strong> ${escapeHtml(params.status)}</p>
                <p style="margin: 0 0 8px;"><strong>Tipo de alerta:</strong> ${escapeHtml(title)}</p>
                <p style="margin: 0 0 8px;"><strong>Tiempo restante 1ra respuesta:</strong> ${formatRemaining(params.firstResponseRemaining)}</p>
                <p style="margin: 0;"><strong>Tiempo restante cierre:</strong> ${formatRemaining(params.resolutionRemaining)}</p>
            </div>

            <p>
                Por favor revisa el ticket a la brevedad.
            </p>
        </div>
    `;

    /*
 * Además del correo, generamos un recordatorio interno
 * para que la alerta SLA aparezca dentro del sistema.
 */
    try {
        await crearRecordatorioInternoSla(params);
    } catch (error) {
        console.error(
            "⚠️ Error creando recordatorio interno SLA:",
            error
        );
    }

    const toEmail = params.to?.trim().toLowerCase();

    // Evita intentar enviar una alerta SLA si no hay correo destino.
    if (!toEmail) {
        console.warn("⏭️ No se envía alerta SLA: destinatario vacío", {
            ticketId: params.ticketId,
            tecnicoNombre: params.tecnicoNombre,
            alertType: params.alertType,
        });

        return;
    }

    const hasMailbox = await graphReaderService.technicianHasValidOutlookMailbox(
        toEmail
    );

    if (!hasMailbox) {
        console.warn("⏭️ No se envía alerta SLA: técnico sin casilla Outlook válida", {
            ticketId: params.ticketId,
            tecnicoNombre: params.tecnicoNombre,
            email: params.to,
            alertType: params.alertType,
        });

        return;
    }

    await graphReaderService.sendReplyEmail({
        to: toEmail,
        subject: `[SLA] Ticket #${params.ticketId} - ${title}`,
        bodyHtml,
    });
}

// Envía un aviso cuando un ticket queda en estado PENDING.
// Este aviso indica que el SLA quedó pausado mientras el ticket permanezca pendiente.
export async function sendTicketPendingEmail(ticketId: number) {
    const ticket = await prisma.ticket.findUnique({
        where: {
            id: ticketId,
        },
        include: {
            empresa: {
                select: {
                    nombre: true,
                },
            },
            requester: {
                select: {
                    nombre: true,
                    email: true,
                },
            },
            assignee: {
                select: {
                    nombre: true,
                    email: true,
                },
            },
        },
    });

    if (!ticket) {
        console.warn("⏭️ No se envía aviso de pendiente: ticket no encontrado", {
            ticketId,
        });

        return;
    }

    const recipients = [
        ticket.assignee?.email,
        process.env.HELPDESK_PENDING_NOTIFY_EMAIL,
    ]
        .filter(Boolean)
        .map((email) => String(email).trim().toLowerCase())
        .filter(Boolean);

    // Quitamos correos duplicados para no enviar el mismo aviso más de una vez.
    const uniqueRecipients: string[] = [...new Set(recipients)];

    if (!uniqueRecipients.length) {
        console.warn("⏭️ No se envía aviso de pendiente: sin destinatarios", {
            ticketId,
            assigneeEmail: ticket.assignee?.email,
            notifyEmail: process.env.HELPDESK_PENDING_NOTIFY_EMAIL,
        });

        return;
    }

    const frontendUrl =
        process.env.FRONTEND_URL ||
        process.env.APP_URL ||
        "https://rids-intranet.netlify.app";

    const ticketUrl = `${frontendUrl}/helpdesk/tickets/${ticket.id}`;

    const bodyHtml = `
        <div style="font-family: Arial, sans-serif; color: #111827; line-height: 1.5;">
            <p>Hola,</p>

            <p>
                El siguiente ticket fue marcado como <strong>pendiente</strong>.
                Mientras permanezca en este estado, su SLA quedará pausado.
            </p>

            <div style="margin: 16px 0; padding: 16px; border: 1px solid #e5e7eb; border-radius: 10px; background: #f9fafb;">
                <p style="margin: 0 0 8px;"><strong>Ticket:</strong> #${ticket.id}</p>
                <p style="margin: 0 0 8px;"><strong>Asunto:</strong> ${escapeHtml(ticket.subject)}</p>
                <p style="margin: 0 0 8px;"><strong>Empresa:</strong> ${escapeHtml(ticket.empresa?.nombre ?? "Sin empresa")}</p>
                <p style="margin: 0 0 8px;"><strong>Solicitante:</strong> ${escapeHtml(ticket.requester?.nombre ?? ticket.fromEmail ?? "Sin solicitante")}</p>
                <p style="margin: 0 0 8px;"><strong>Técnico asignado:</strong> ${escapeHtml(ticket.assignee?.nombre ?? "Sin asignar")}</p>
                <p style="margin: 0;"><strong>Estado:</strong> Pendiente</p>
            </div>

            <p>
                <a href="${ticketUrl}" target="_blank">
                    Ver ticket
                </a>
            </p>

            <p>
                Este aviso fue generado automáticamente por la ticketera RIDS.
            </p>
        </div>
    `;

    for (const toEmail of uniqueRecipients) {
        const hasMailbox = await graphReaderService.technicianHasValidOutlookMailbox(
            toEmail
        );

        if (!hasMailbox) {
            console.warn("⏭️ No se envía aviso de pendiente: destinatario sin casilla Outlook válida", {
                ticketId: ticket.id,
                email: toEmail,
            });

            continue;
        }

        await graphReaderService.sendReplyEmail({
            to: toEmail,
            subject: `[Ticket pendiente] #${ticket.id} - SLA pausado`,
            bodyHtml,
        });
    }
}