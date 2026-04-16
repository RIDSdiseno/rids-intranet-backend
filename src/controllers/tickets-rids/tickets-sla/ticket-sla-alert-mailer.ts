import { graphReaderService } from "../../../service/email/graph-reader.service.js";

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

export async function sendTicketSlaAlertEmail(params: TicketSlaAlertEmailParams) {
    const title = getAlertTitle(params.alertType);

    const bodyHtml = `
        <div style="font-family: Arial, sans-serif; color: #111827; line-height: 1.5;">
            <p>Hola ${params.tecnicoNombre || "técnico"},</p>

            <p>
                Se detectó una alerta SLA en un ticket asignado a ti.
            </p>

            <div style="margin: 16px 0; padding: 16px; border: 1px solid #e5e7eb; border-radius: 10px; background: #f9fafb;">
                <p style="margin: 0 0 8px;"><strong>Ticket:</strong> #${params.ticketId}</p>
                <p style="margin: 0 0 8px;"><strong>Asunto:</strong> ${params.subject}</p>
                <p style="margin: 0 0 8px;"><strong>Prioridad:</strong> ${params.priority}</p>
                <p style="margin: 0 0 8px;"><strong>Estado:</strong> ${params.status}</p>
                <p style="margin: 0 0 8px;"><strong>Tipo de alerta:</strong> ${title}</p>
                <p style="margin: 0 0 8px;"><strong>Tiempo restante 1ra respuesta:</strong> ${formatRemaining(params.firstResponseRemaining)}</p>
                <p style="margin: 0;"><strong>Tiempo restante cierre:</strong> ${formatRemaining(params.resolutionRemaining)}</p>
            </div>

            <p>
                Por favor revisa el ticket a la brevedad.
            </p>
        </div>
    `;

    await graphReaderService.sendReplyEmail({
        to: params.to,
        subject: `[SLA] Ticket #${params.ticketId} - ${title}`,
        bodyHtml,
    });
}