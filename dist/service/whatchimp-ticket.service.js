// src/service/whatchimp-ticket.service.ts
import { prisma } from "../lib/prisma.js";
import { TicketStatus, TicketPriority, TicketEventType, TicketActorType, MessageDirection } from "@prisma/client";
import { bus } from "../lib/events.js";
import crypto from "crypto";
export async function searchEmpresaByName(query, email) {
    const q = query.trim();
    // 1. Lookup por dominio del correo (más confiable)
    if (email && email.includes("@")) {
        const domain = (email.split("@")[1] ?? "").toLowerCase().trim();
        const byDomain = await prisma.empresa.findMany({
            where: { dominios: { has: domain } },
            select: { id_empresa: true, nombre: true },
        });
        if (byDomain.length > 0) {
            console.log(`[SEARCH] Empresa por dominio "${domain}":`, byDomain.map(e => e.nombre));
            return byDomain.map(e => ({ id: e.id_empresa, nombre: e.nombre }));
        }
    }
    if (!q)
        return [];
    const qLower = q.toLowerCase();
    const words = qLower.split(/\s+/).filter(w => w.length >= 3);
    const matches = (text) => {
        const t = text.toLowerCase();
        if (t.includes(qLower) || qLower.includes(t))
            return true;
        return words.some(w => t.includes(w));
    };
    // 2. Fallback: búsqueda por nombre y aliases
    const [allEmpresas, allAliases] = await Promise.all([
        prisma.empresa.findMany({ select: { id_empresa: true, nombre: true } }),
        prisma.empresaAliasOutlook.findMany({ select: { alias: true, empresaId: true } }),
    ]);
    const seen = new Set();
    const result = [];
    for (const e of allEmpresas) {
        if (matches(e.nombre)) {
            seen.add(e.id_empresa);
            result.push({ id: e.id_empresa, nombre: e.nombre });
        }
    }
    const aliasHits = new Set(allAliases.filter(a => matches(a.alias)).map(a => a.empresaId));
    for (const e of allEmpresas) {
        if (aliasHits.has(e.id_empresa) && !seen.has(e.id_empresa)) {
            seen.add(e.id_empresa);
            result.push({ id: e.id_empresa, nombre: e.nombre });
        }
    }
    return result;
}
export async function createTicketFromWhatsapp(input) {
    const { email, company, subject, description, transcript, phone, name } = input;
    try {
        // 1️⃣ Buscar empresa: dominio del correo → nombre → alias
        let empresa = null;
        // a) Por dominio del correo (más confiable)
        if (email.includes("@")) {
            const domain = (email.split("@")[1] ?? "").toLowerCase().trim();
            empresa = await prisma.empresa.findFirst({
                where: { dominios: { has: domain } },
                select: { id_empresa: true, nombre: true },
            });
            if (empresa)
                console.log(`[WC-TICKET] Empresa por dominio "${domain}": ${empresa.nombre}`);
        }
        // b) Por nombre exacto/parcial (fallback)
        if (!empresa) {
            empresa = await prisma.empresa.findFirst({
                where: { nombre: { contains: company, mode: "insensitive" } },
                select: { id_empresa: true, nombre: true },
            });
            if (empresa)
                console.log(`[WC-TICKET] Empresa por nombre "${company}": ${empresa.nombre}`);
        }
        // c) Por alias (fallback final)
        if (!empresa) {
            const hits = await searchEmpresaByName(company);
            if (hits.length === 1 && hits[0]) {
                empresa = await prisma.empresa.findUnique({
                    where: { id_empresa: hits[0].id },
                    select: { id_empresa: true, nombre: true },
                });
                if (empresa)
                    console.log(`[WC-TICKET] Empresa por alias "${company}": ${empresa.nombre}`);
            }
        }
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
            phone ? `📞 Teléfono: ${phone}` : null,
            name ? `👤 Nombre: ${name}` : null,
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
            channel: "WHATSAPP",
            from: email,
        });
        console.log(`[WC-TICKET] ✅ Ticket #${ticket.id} creado`);
        return { ok: true, ticketId: ticket.id };
    }
    catch (err) {
        console.error("[WC-TICKET] Error:", err);
        return { ok: false, error: "Error interno al crear el ticket." };
    }
}
//# sourceMappingURL=whatchimp-ticket.service.js.map