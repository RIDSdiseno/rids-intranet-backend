// src/service/whatchimp-ticket.service.ts
import { prisma } from "../lib/prisma.js";
import { TicketStatus, TicketPriority, TicketEventType, TicketActorType, MessageDirection } from "@prisma/client";
import { bus } from "../lib/events.js";
import crypto from "crypto";

export interface WhatsappTicketInput {
  email: string;
  company: string;
  subject: string;
  description: string;
  transcript: Array<{ from: "client" | "bot"; text: string }>;
  phone?: string;
  name?: string;
}

export interface WhatsappTicketResult {
  ok: boolean;
  ticketId?: number;
  error?: string;
}

export async function createTicketFromWhatsapp(
  input: WhatsappTicketInput
): Promise<WhatsappTicketResult> {
  const { email, company, subject, description, transcript, phone, name } = input;

  try {
    // 1️⃣ Buscar empresa por nombre (case-insensitive)
    const empresa = await prisma.empresa.findFirst({
      where: {
        nombre: { contains: company, mode: "insensitive" },
      },
    });

    if (!empresa) {
      console.warn(`[WC-TICKET] Empresa no encontrada: "${company}"`);
      return { ok: false, error: `Empresa "${company}" no registrada en el sistema.` };
    }

    console.log(`[WC-TICKET] Empresa: ${empresa.nombre} (id: ${empresa.id_empresa})`);

    // 2️⃣ Buscar solicitante por email
    const requester = await prisma.solicitante.findFirst({
      where: { email, empresaId: empresa.id_empresa, isActive: true },
    });

    console.log(`[WC-TICKET] Requester: ${requester ? requester.nombre : "no encontrado"}`);

    // 3️⃣ Armar cuerpo con todos los datos
    const transcriptText = transcript
      .map(t => `[${t.from === "client" ? (name || "Cliente") : "RIDSI"}]: ${t.text}`)
      .join("\n");

    const bodyText = [
      `📱 Ticket generado vía WhatsApp`,
      phone    ? `📞 Teléfono: ${phone}`    : null,
      name     ? `👤 Nombre: ${name}`        : null,
      `📧 Correo: ${email}`,
      `🏢 Empresa: ${company}`,
      ``,
      `📋 Problema: ${description}`,
      ``,
      `── Conversación ──`,
      transcriptText,
    ].filter(Boolean).join("\n");

    // 4️⃣ Crear ticket
    const ticket = await prisma.$transaction(async (tx) => {
      const newTicket = await tx.ticket.create({
        data: {
          publicId: crypto.randomUUID(),
          subject,
          status: TicketStatus.NEW,
          priority: TicketPriority.NORMAL,
          channel: "API",
          fromEmail: email,
          lastActivityAt: new Date(),
          empresa: { connect: { id_empresa: empresa.id_empresa } },
          ...(requester && {
            requester: { connect: { id_solicitante: requester.id_solicitante } },
          }),
        },
      });

      await tx.ticketMessage.create({
        data: {
          ticketId: newTicket.id,
          direction: MessageDirection.INBOUND,
          bodyText,
          isInternal: false,
          fromEmail: email,
        },
      });

      await tx.ticketEvent.create({
        data: {
          ticketId: newTicket.id,
          type: TicketEventType.CREATED,
          actorType: TicketActorType.SYSTEM,
        },
      });

      return newTicket;
    });

    bus.emit("ticket.created", {
      id: ticket.id,
      publicId: ticket.publicId,
      subject: ticket.subject,
      empresaId: ticket.empresaId,
      priority: ticket.priority,
      channel: "API",
      from: email,
    });

    console.log(`[WC-TICKET] ✅ Ticket #${ticket.id} creado`);
    return { ok: true, ticketId: ticket.id };

  } catch (err) {
    console.error("[WC-TICKET] Error:", err);
    return { ok: false, error: "Error interno al crear el ticket." };
  }
}