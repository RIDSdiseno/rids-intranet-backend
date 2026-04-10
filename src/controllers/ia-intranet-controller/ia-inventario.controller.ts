import type { Request, Response } from "express";
import { prisma } from "../../lib/prisma.js";
import OpenAI from "openai";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// Controlador para analizar el inventario IT de una empresa usando IA
export async function analizarInventarioEmpresa(req: Request, res: Response) {
    try {
        const empresaId = Number(req.params.empresaId);
        if (!Number.isInteger(empresaId) || empresaId <= 0) {
            return res.status(400).json({ error: "empresaId inválido" });
        }

        // 1) Traer equipos de esa empresa (vía solicitante->empresa)
        const equipos = await prisma.equipo.findMany({
            where: {
                solicitante: { empresaId },
            },
            include: { detalle: true },
            orderBy: { id_equipo: "asc" },
        });

        // 2) Resumen (reduce tokens/costo)
        const resumen = equipos.map((e) => ({
            id: e.id_equipo,
            serial: e.serial,
            marca: e.marca,
            modelo: e.modelo,
            procesador: e.procesador,
            ram: e.ram,
            disco: e.disco,
            propiedad: e.propiedad,
            so: e.detalle?.so ?? null,
            estadoAlm: e.detalle?.estadoAlm ?? null,
            office: e.detalle?.office ?? null,
            teamViewer: e.detalle?.teamViewer ?? null,
            revisado: e.detalle?.revisado ?? null,
        }));

        // 3) Prompt: pide salida estructurada
        const prompt = `
Analiza este inventario IT.

Devuelve SOLO JSON con esta estructura:

{
  "hallazgos": [
    { "severidad": "ALTA | MEDIA | BAJA", "descripcion": "texto" }
  ],
  "riesgos": ["texto"],
  "recomendaciones": ["texto"],
  "resumen": "texto corto"
}

Inventario:
${JSON.stringify(resumen, null, 2)}
`;

        // 4) Llamada a IA
        const completion = await openai.chat.completions.create({
            model: "gpt-4.1-mini",
            response_format: { type: "json_object" },
            messages: [
                { role: "system", content: "Eres un experto en soporte IT." },
                { role: "user", content: prompt }
            ]
        });

        const content = completion.choices?.[0]?.message?.content;

        if (!content) {
            return res.status(500).json({
                error: "La IA no devolvió contenido"
            });
        }

        const analisis = JSON.parse(content);

        return res.json({
            empresaId,
            totalEquipos: equipos.length,
            analisis,
        });
    } catch (err) {
        console.error("analizarInventarioEmpresa:", err);
        return res.status(500).json({ error: "Error analizando inventario" });
    }
}