import type { Request, Response } from "express";
import { prisma } from "../../lib/prisma.js";
import OpenAI from "openai";

const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY
});

export async function generarInformeMensualIA(req: Request, res: Response) {
    try {

        const empresaId = Number(req.params.empresaId);
        const year = Number(req.params.year);
        const month = Number(req.params.month);

        const start = new Date(year, month - 1, 1);
        const end = new Date(year, month, 0);

        // 1️⃣ Traer datos del sistema
        const [visitas, tickets, equipos] = await Promise.all([
            prisma.visita.findMany({
                where: {
                    empresaId,
                    inicio: {
                        gte: start,
                        lte: end
                    }
                }
            }),

            prisma.freshdeskTicket.findMany({
                where: {
                    empresaId,
                    createdAt: {
                        gte: start,
                        lte: end
                    }
                }
            }),

            prisma.equipo.findMany({
                where: {
                    solicitante: {
                        empresaId
                    }
                }
            })
        ]);

        // 2️⃣ Estadísticas básicas
        const stats = {
            totalVisitas: visitas.length,
            totalTickets: tickets.length,
            totalEquipos: equipos.length,
            visitasPendientes: visitas.filter(v => v.status === "PENDIENTE").length,
            ticketsAbiertos: tickets.filter(t => t.status !== 5).length
        };

        // 3️⃣ Prompt para IA
        const prompt = `
Eres un consultor IT especializado en auditorías tecnológicas empresariales.

Debes redactar un informe mensual profesional para un cliente.

Datos del periodo:

Visitas técnicas realizadas: ${stats.totalVisitas}
Tickets generados: ${stats.totalTickets}
Equipos registrados en inventario: ${stats.totalEquipos}
Visitas pendientes: ${stats.visitasPendientes}
Tickets abiertos: ${stats.ticketsAbiertos}

Contexto:
- Las visitas corresponden a soporte técnico presencial o remoto.
- Los tickets corresponden a incidencias reportadas por usuarios.
- El inventario corresponde a los equipos gestionados por el área TI.

Redacta un informe profesional con estas secciones:

1. Resumen Ejecutivo
2. Actividades Realizadas durante el mes
3. Estado del Soporte Técnico
4. Situación del Inventario Tecnológico
5. Riesgos detectados
6. Recomendaciones técnicas

El informe debe ser claro, profesional y orientado a clientes empresariales.
No uses listas numeradas largas, usa párrafos claros.
`;

        // 4️⃣ Llamada a OpenAI
        const completion = await openai.chat.completions.create({
            model: "gpt-4.1-mini",
            messages: [
                {
                    role: "user",
                    content: prompt
                }
            ],
            temperature: 0.4
        });

        const texto = completion.choices[0]?.message?.content ?? "";

        res.json({
            empresaId,
            year,
            month,
            informe: texto
        });

    } catch (error) {
        console.error(error);
        res.status(500).json({ error: "Error generando informe IA" });
    }
}