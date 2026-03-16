import OpenAI from "openai";
const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY
});
/* ======================================================
   LIMPIAR CONTEXTO PARA IA
====================================================== */
function prepararContextoIA(data) {
    return {
        empresa: data.empresa?.nombre,
        periodo: data.month,
        kpis: data.kpis,
        visitas: {
            porTipo: data.visitas?.porTipo,
            porTecnico: data.visitas?.porTecnico
        },
        mantenimientos: data.mantenimientos,
        extras: data.extras?.totales,
        tickets: {
            total: data.tickets?.total,
            topUsuarios: data.tickets?.topUsuarios
        },
        mantenciones: {
            total: data.mantenciones?.total,
            porStatus: data.mantenciones?.porStatus,
            porTecnico: data.mantenciones?.porTecnico
        },
        inventario: {
            totalEquipos: data.inventario?.total
        }
    };
}
/* ======================================================
   PARSE JSON ROBUSTO
====================================================== */
function parseJsonSafe(text) {
    try {
        return JSON.parse(text);
    }
    catch { }
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");
    if (start >= 0 && end > start) {
        return JSON.parse(text.slice(start, end + 1));
    }
    throw new Error("IA no devolvió JSON válido");
}
/* ======================================================
   GENERAR ANALISIS IA
====================================================== */
export async function generarAnalisisIA(reporteEmpresa) {
    const contextoIA = prepararContextoIA(reporteEmpresa);
    const prompt = `
Eres un consultor senior de infraestructura TI especializado en soporte corporativo.

Debes analizar los datos operativos del cliente y generar un informe ejecutivo.

Datos del periodo:

${JSON.stringify(contextoIA, null, 2)}

Responde SOLO JSON.

Formato:

{
  "resumen_ejecutivo": "",
  "analisis_operativo": "",
  "hallazgos": [],
  "riesgos": [],
  "recomendaciones": [
    {"prioridad":"Alta|Media|Baja","texto":""}
  ],
  "plan_30_60_90": {
    "d30": [],
    "d60": [],
    "d90": []
  },
  "kpis_sugeridos": []
}

Reglas:

- resumen_ejecutivo: máximo 120 palabras
- analisis_operativo: máximo 200 palabras
- hallazgos: 4 a 8
- riesgos: 3 a 6
- recomendaciones: 6 a 10
- plan_30_60_90: 4 acciones por periodo
- kpis_sugeridos: lista de métricas de seguimiento
`;
    const completion = await openai.chat.completions.create({
        model: "gpt-4.1-mini",
        temperature: 0.4,
        messages: [
            {
                role: "system",
                content: "Eres un consultor experto en operaciones TI y análisis de infraestructura empresarial."
            },
            {
                role: "user",
                content: prompt
            }
        ]
    });
    const raw = completion.choices[0]?.message?.content ?? "";
    return parseJsonSafe(raw);
}
//# sourceMappingURL=ia-reportes.service.js.map