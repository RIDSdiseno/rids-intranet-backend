import type { Request, Response } from "express";
import { prisma } from "../lib/prisma.js";
import { runAI } from "../utils/ai.js";
import { sendTicketCreatedEmail } from "../service/email.service.js";

export async function listTickets(req: Request, res: Response) {
  try {
    const tickets = await prisma.freshdeskTicket.findMany({
      orderBy: { createdAt: "desc" },
    });

    // Convertir BigInt a string para que JSON.stringify no falle
    const data = tickets.map((t) => ({
      ...t,
      id: t.id.toString(),
    }));

    return res.json({ ok: true, data });
  } catch (e: any) {
    console.error("Error listing tickets:", e);
    return res.status(500).json({ ok: false, error: e?.message ?? "error" });
  }
}

export async function createTicket(req: Request, res: Response) {
  try {
    const { subject, description, email, priority, status } = req.body;

    if (!subject || !email) {
      return res.status(400).json({ success: false, error: "Faltan campos requeridos (subject, email)" });
    }

    // Generar ID temporal (en producción esto vendría de la respuesta de Freshdesk)
    const id = BigInt(Date.now());

    // Crear ticket en BD local
    const ticket = await prisma.freshdeskTicket.create({
      data: {
        id,
        subject,
        requesterEmail: email,
        status: Number(status) || 2, // 2: Open
        priority: Number(priority) || 1, // 1: Low
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    });

    // Generar contexto con IA
    let aiContext = "Hemos recibido tu solicitud.";
    try {
      const prompt = `El usuario ha reportado el siguiente problema: "${description || subject}". Genera un resumen muy breve, amable y profesional (máximo 30 palabras) confirmando que entendimos su problema, dirigido directamente al usuario (usando "tú").`;
      
      const aiResponse = await runAI({
        userText: prompt,
        context: {
          from: "system",
          phone: "system",
          turns: 1,
          transcript: []
        }
      });
      if (aiResponse) aiContext = aiResponse;
    } catch (e) {
      console.error("Error generando contexto IA:", e);
    }

    // Enviar correo en segundo plano (no bloqueante pero capturando error)
    sendTicketCreatedEmail(email, id.toString(), aiContext)
      .catch(e => console.error("Error enviando correo de ticket:", e));

    return res.status(201).json({ success: true, data: { ...ticket, id: ticket.id.toString() } });
  } catch (error: any) {
    console.error("Error creating ticket:", error);
    return res.status(500).json({ success: false, error: "Error interno al crear ticket" });
  }
}
