import { prisma } from "../../lib/prisma.js";
import OpenAI from "openai";
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
export async function analizarInventarioEmpresa(req, res) {
    try {
        const user = req.user;
        const empresaIdParam = Number(req.params.empresaId);
        const mes = Number(req.query.mes ?? new Date().getMonth() + 1);
        const ano = Number(req.query.ano ?? new Date().getFullYear());
        if (!Number.isInteger(empresaIdParam) || empresaIdParam <= 0) {
            return res.status(400).json({ error: "empresaId inválido" });
        }
        if (!Number.isInteger(mes) || mes < 1 || mes > 12) {
            return res.status(400).json({ error: "mes inválido" });
        }
        if (!Number.isInteger(ano) || ano < 2020) {
            return res.status(400).json({ error: "año inválido" });
        }
        const empresaId = user?.rol === "CLIENTE"
            ? user.empresaId
            : empresaIdParam;
        if (!empresaId) {
            return res.status(403).json({
                error: "No tienes empresa asociada",
            });
        }
        if (user?.rol === "CLIENTE" && empresaIdParam !== user.empresaId) {
            return res.status(403).json({
                error: "No tienes permisos para analizar esta empresa",
            });
        }
        const empresa = await prisma.empresa.findUnique({
            where: { id_empresa: empresaId },
            select: {
                id_empresa: true,
                nombre: true,
            },
        });
        if (!empresa) {
            return res.status(404).json({
                error: "Empresa no encontrada",
            });
        }
        const equipos = await prisma.equipo.findMany({
            where: {
                deletedAt: null,
                solicitante: {
                    empresaId,
                },
            },
            include: {
                detalle: true,
            },
            orderBy: {
                id_equipo: "asc",
            },
        });
        const resumenInventario = equipos.map((e) => ({
            id: e.id_equipo,
            serial: e.serial,
            marca: e.marca,
            modelo: e.modelo,
            procesador: e.procesador,
            ram: e.ram,
            disco: e.disco,
            propiedad: e.propiedad,
            estado: e.estado,
            anioPc: e.anioPc,
            anioPcOrigen: e.anioPcOrigen,
            so: e.detalle?.so ?? null,
            estadoAlm: e.detalle?.estadoAlm ?? null,
            office: e.detalle?.office ?? null,
            teamViewer: e.detalle?.teamViewer ?? null,
            revisado: e.detalle?.revisado ?? null,
        }));
        const prompt = `
Analiza este inventario IT de la empresa "${empresa.nombre}" para el periodo ${String(mes).padStart(2, "0")}/${ano}.

Devuelve SOLO JSON con esta estructura:

{
  "hallazgos": [
    { "severidad": "ALTA | MEDIA | BAJA", "descripcion": "texto" }
  ],
  "riesgos": ["texto"],
  "recomendaciones": ["texto"],
  "resumen": "texto corto"
}

Criterios:
- Detecta equipos antiguos.
- Detecta bajo nivel de RAM.
- Detecta discos mecánicos o almacenamiento problemático.
- Detecta sistemas operativos antiguos o no informados.
- Detecta equipos sin revisión.
- Detecta falta de TeamViewer o datos de soporte remoto.
- Entrega recomendaciones concretas y accionables.
- Considera que este análisis será comparado mes a mes.

Inventario:
${JSON.stringify(resumenInventario, null, 2)}
`;
        const completion = await openai.chat.completions.create({
            model: "gpt-4.1-mini",
            response_format: { type: "json_object" },
            messages: [
                {
                    role: "system",
                    content: "Eres un experto en soporte IT, inventario tecnológico, seguridad y renovación de equipos.",
                },
                {
                    role: "user",
                    content: prompt,
                },
            ],
        });
        const content = completion.choices?.[0]?.message?.content;
        if (!content) {
            return res.status(500).json({
                error: "La IA no devolvió contenido",
            });
        }
        const analisis = JSON.parse(content);
        const saved = await prisma.analisisInventarioIA.upsert({
            where: {
                empresaId_mes_ano: {
                    empresaId,
                    mes,
                    ano,
                },
            },
            update: {
                totalEquipos: equipos.length,
                resumen: analisis.resumen ?? null,
                hallazgos: analisis.hallazgos ?? [],
                riesgos: analisis.riesgos ?? [],
                recomendaciones: analisis.recomendaciones ?? [],
                generadoPorId: user?.id ?? null,
            },
            create: {
                empresaId,
                mes,
                ano,
                totalEquipos: equipos.length,
                resumen: analisis.resumen ?? null,
                hallazgos: analisis.hallazgos ?? [],
                riesgos: analisis.riesgos ?? [],
                recomendaciones: analisis.recomendaciones ?? [],
                generadoPorId: user?.id ?? null,
            },
        });
        return res.json({
            ok: true,
            empresaId,
            empresa,
            mes,
            ano,
            totalEquipos: equipos.length,
            analisis,
            registroId: saved.id,
        });
    }
    catch (err) {
        console.error("analizarInventarioEmpresa:", err);
        return res.status(500).json({
            error: "Error analizando inventario",
        });
    }
}
export async function getAnalisisInventarioEmpresa(req, res) {
    try {
        const user = req.user;
        const empresaIdParam = Number(req.params.empresaId);
        const mes = Number(req.query.mes);
        const ano = Number(req.query.ano);
        if (!Number.isInteger(empresaIdParam) || empresaIdParam <= 0) {
            return res.status(400).json({ error: "empresaId inválido" });
        }
        if (!Number.isInteger(mes) || mes < 1 || mes > 12) {
            return res.status(400).json({ error: "mes inválido" });
        }
        if (!Number.isInteger(ano) || ano < 2020) {
            return res.status(400).json({ error: "año inválido" });
        }
        const empresaId = user?.rol === "CLIENTE"
            ? user.empresaId
            : empresaIdParam;
        if (user?.rol === "CLIENTE" && empresaIdParam !== user.empresaId) {
            return res.status(403).json({
                error: "No tienes permisos para ver esta empresa",
            });
        }
        const registro = await prisma.analisisInventarioIA.findUnique({
            where: {
                empresaId_mes_ano: {
                    empresaId,
                    mes,
                    ano,
                },
            },
            include: {
                empresa: {
                    select: {
                        id_empresa: true,
                        nombre: true,
                    },
                },
                generadoPor: {
                    select: {
                        id_tecnico: true,
                        nombre: true,
                        email: true,
                    },
                },
            },
        });
        if (!registro) {
            return res.json({
                ok: true,
                data: null,
            });
        }
        return res.json({
            ok: true,
            data: registro,
        });
    }
    catch (error) {
        console.error("getAnalisisInventarioEmpresa:", error);
        return res.status(500).json({
            ok: false,
            error: "Error obteniendo análisis de inventario",
        });
    }
}
//# sourceMappingURL=ia-inventario.controller.js.map