import type { Request, Response } from "express";
import { prisma } from "../lib/prisma.js";
import { runAI } from "../utils/ai.js";
import { classifyTicket } from "../utils/classifier.js";
import { sendTicketCreatedEmail } from "../service/email.service.js";

export async function createTicket(req: Request, res: Response) {
  try {
    const { subject, description, email } = req.body;

    if (!subject || !email) {
      return res.status(400).json({ success: false, error: "Faltan campos (subject, email)" });
    }

    // 1. Lógica de Empresa
    const domain = email.split('@')[1];
    let empresa = await prisma.empresa.findFirst({
      where: { dominios: { has: domain } }
    });
    const empresaId = empresa?.id_empresa || 22; 

    // 2. Clasificación y Carga de Configuración Dinámica
    const areaDetectada = classifyTicket(`${subject} ${description || ""}`);
    console.log(`🏷️ Área detectada: ${areaDetectada}`);

    // Buscamos el mensaje que el usuario de esa área editó en la DB
    const configArea = await (prisma as any).areaConfig.findUnique({
      where: { nombre: areaDetectada }
    });

    // Mensaje base personalizado (usamos fallback si la tabla está vacía)
    const mensajePersonalizado = configArea?.mensajeBase || "Estamos revisando tu caso a la brevedad.";
    const firmaArea = configArea?.firmaArea || `Equipo de ${areaDetectada}`;

    // 3. IA: Generar resumen integrando la personalización del rol
    console.log("🤖 Generando resumen con IA...");
    let aiContext = mensajePersonalizado;

    try {
      const prompt = `
        Actúa como un asistente del área de ${areaDetectada}. 
        Instrucción de tu jefe de área: "${mensajePersonalizado}".
        Reporte del cliente: "${description || subject}".
        
        TAREA: Crea una respuesta muy breve (máx 30 palabras), empática y profesional. 
        DEBES integrar la esencia de la instrucción de tu jefe y responder directamente al reporte. 
        Habla de "tú". No incluyas la firma al final.
      `;
      
      const aiResponse = await runAI({
        userText: prompt,
        context: { from: "system", transcript: [], email }
      });
      if (aiResponse) aiContext = aiResponse.replace(/^"|"$/g, '');
    } catch (aiErr) {
      console.error("⚠️ Error IA, usando mensaje base.");
    }

    // 4. Guardar en tabla Ticket
    const newTicket = await prisma.ticket.create({
      data: {
        subject,
        empresaId,
        fromEmail: email,
        aiSummary: aiContext, 
        publicId: `RID-${Date.now()}`, 
        status: 'NEW', 
        priority: 'NORMAL',
        channel: 'WEB',
        lastActivityAt: new Date(),
        messages: {
          create: {
            direction: 'INBOUND',
            bodyText: description || subject,
            fromEmail: email,
            isInternal: false
          }
        }
      }
    });

    // 5. Email: Notificación (puedes concatenar la firma aquí si quieres)
    sendTicketCreatedEmail(email, newTicket.publicId, `${aiContext}\n\n${firmaArea}`)
      .then(() => console.log("✅ Correo enviado satisfactoriamente"))
      .catch(err => console.error("❌ Error Email:", err));

    return res.status(201).json({ 
      success: true, 
      data: { 
        id: newTicket.id,
        public_id: newTicket.publicId,
        area: areaDetectada,
        resumen_ia: aiContext 
      } 
    });

  } catch (error: any) {
    console.error("💥 ERROR CRÍTICO 500:", error.message || error);
    return res.status(500).json({ success: false, error: error.message || "Error interno" });
  }
}

export async function listTickets(req: Request, res: Response) {
  try {
    const rows = await prisma.ticket.findMany({
      orderBy: { createdAt: "desc" },
      take: 20,
      include: { empresa: true }
    });
    return res.json({ ok: true, data: rows });
  } catch (e: any) {
    return res.status(500).json({ ok: false, error: "Error al listar" });
  }
}