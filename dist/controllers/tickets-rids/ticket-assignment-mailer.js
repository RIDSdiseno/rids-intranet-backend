// Este módulo se encarga de enviar correos electrónicos a los técnicos cuando se les asigna un ticket.
import { prisma } from "../../lib/prisma.js";
import { MessageDirection } from "@prisma/client";
import { graphReaderService } from "../../service/email/graph-reader.service.js";
// Función para escapar caracteres HTML y evitar problemas de formato en el correo.
function escapeHtml(text) {
    return text
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}
function translateStatus(status) {
    const map = {
        NEW: "Nuevo",
        OPEN: "Abierto",
        PENDING: "Pendiente",
        RESOLVED: "Resuelto",
        CLOSED: "Cerrado",
    };
    return status ? (map[status] ?? status) : "Sin estado";
}
function translatePriority(priority) {
    const map = {
        LOW: "Baja",
        NORMAL: "Normal",
        HIGH: "Alta",
        URGENT: "Urgente",
    };
    return priority ? (map[priority] ?? priority) : "Sin prioridad";
}
function getPriorityColor(priority) {
    switch (priority) {
        case "LOW":
            return "#6b7280";
        case "HIGH":
            return "#f59e0b";
        case "URGENT":
            return "#dc2626";
        case "NORMAL":
        default:
            return "#2563eb";
    }
}
function getStatusColor(status) {
    switch (status) {
        case "NEW":
            return "#7c3aed";
        case "OPEN":
            return "#2563eb";
        case "PENDING":
            return "#d97706";
        case "RESOLVED":
            return "#059669";
        case "CLOSED":
            return "#4b5563";
        default:
            return "#2563eb";
    }
}
// Envía un correo al técnico asignado con los detalles del ticket y el último mensaje del cliente.
export async function sendTicketAssignedEmail(ticketId) {
    const ticket = await prisma.ticket.findUnique({
        where: { id: ticketId },
        include: {
            empresa: { select: { nombre: true } },
            requester: { select: { nombre: true, email: true } },
            assignee: {
                select: {
                    id_tecnico: true,
                    nombre: true,
                    email: true,
                    cargo: true,
                    area: true,
                },
            },
            messages: {
                where: {
                    direction: MessageDirection.INBOUND,
                    isInternal: false,
                },
                orderBy: { createdAt: "desc" },
                take: 1,
                select: {
                    bodyText: true,
                    bodyHtml: true,
                    createdAt: true,
                },
            },
        },
    });
    if (!ticket?.assignee?.email) {
        console.warn(`⚠️ No se pudo enviar correo de asignación: ticket ${ticketId} sin técnico con email`);
        return;
    }
    // Construir la URL del ticket en el frontend para incluirla en el correo.
    const frontendUrl = process.env.FRONTEND_URL?.trim() ||
        process.env.CORS_ORIGIN?.split(",")[0]?.trim() ||
        "http://localhost:5173";
    const ticketUrl = `${frontendUrl.replace(/\/+$/, "")}/helpdesk/tickets/${ticket.id}`;
    const lastMessage = ticket.messages?.[0];
    const subject = `Ticket asignado #${ticket.id}: ${ticket.subject}`;
    const lastMessageHtml = lastMessage?.bodyHtml
        ? lastMessage.bodyHtml
        : `<div style="white-space:pre-wrap;">${escapeHtml(lastMessage?.bodyText || "Sin mensaje inicial")}</div>`;
    const bodyHtml = `
        <div style="font-family: Arial, sans-serif; font-size: 14px; color: #222;">
            <h2 style="margin-bottom: 16px;">Se te ha asignado un ticket</h2>

            <p><strong>Ticket:</strong> #${ticket.id}</p>
            <p><strong>Asunto:</strong> ${escapeHtml(ticket.subject)}</p>
            <p><strong>Empresa:</strong> ${escapeHtml(ticket.empresa?.nombre || "Sin empresa")}</p>
            <p><strong>Solicitante:</strong> ${escapeHtml(ticket.requester?.nombre || "Sin solicitante")}</p>
            <p><strong>Email solicitante:</strong> ${escapeHtml(ticket.requester?.email || ticket.fromEmail || "Sin email")}</p>
            <p><strong>Estado:</strong> ${escapeHtml(translateStatus(ticket.status))}</p>
            <p><strong>Prioridad:</strong> ${escapeHtml(translatePriority(ticket.priority))}</p>

            <hr style="margin: 20px 0;" />

            <p><strong>Último mensaje del cliente:</strong></p>
            <div style="padding: 12px; border: 1px solid #ddd; border-radius: 8px; background: #fafafa;">
                ${lastMessageHtml}
            </div>

            <p style="margin-top: 20px;">
                <a href="${ticketUrl}" target="_blank" rel="noopener noreferrer">
                    Abrir ticket
                </a>
            </p>
        </div>
    `;
    await graphReaderService.sendReplyEmail({
        to: ticket.assignee.email,
        subject,
        bodyHtml,
    });
    console.log(`✅ Correo de asignación enviado a ${ticket.assignee.email} para ticket #${ticket.id}`);
}
//# sourceMappingURL=ticket-assignment-mailer.js.map