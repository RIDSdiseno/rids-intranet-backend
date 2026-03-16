import OpenAI from "openai";
import { buildReporteEmpresaData } from "../../service/ia-metricas-reportes/reportEmpresa.service.js";
const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY
});
export async function generarRecomendacionesOperativasIA(req, res) {
    try {
        const empresaId = Number(req.params.empresaId);
        const year = Number(req.params.year);
        const month = Number(req.params.month);
        const ym = `${year}-${String(month).padStart(2, "0")}`;
        /**
         * Obtener TODOS los datos del informe
         */
        const reporte = await buildReporteEmpresaData(empresaId, ym);
        /**
         * Reducir dataset para la IA
         * (evita enviar inventarios gigantes)
         */
        const contextoIA = {
            periodo: ym,
            empresa: reporte.empresa?.nombre ?? null,
            kpis: reporte.kpis,
            visitas: {
                total: reporte.kpis.visitas.count,
            },
            tickets: {
                total: reporte.tickets.total,
                topUsuarios: reporte.tickets.topUsuarios
            },
            mantenciones: {
                total: reporte.mantenciones.total,
                porStatus: reporte.mantenciones.porStatus,
                porTecnico: reporte.mantenciones.porTecnico,
                topSolicitantes: reporte.mantenciones.topSolicitantes
            },
            inventario: {
                totalEquipos: reporte.inventario.total
            },
            usuariosCRM: reporte.usuariosCRM.length
        };
        /**
         * Prompt IA
         */
        const prompt = `
Eres un consultor senior de infraestructura y soporte TI que genera informes operativos mensuales para clientes empresariales.

Debes analizar todos los datos operativos del soporte técnico y producir un análisis profesional.

Considera en tu análisis:

• Tickets de soporte
• Visitas técnicas
• Mantenciones remotas
• Inventario de equipos
• Usuarios atendidos
• Distribución de trabajo por técnico
• Usuarios con incidencias recurrentes

Datos operativos del periodo:
${JSON.stringify(contextoIA)}

Genera un informe ejecutivo.

Formato de salida (SOLO JSON válido):

{
  "resumen_ejecutivo": "",
  "hallazgos": [],
  "riesgos": [],
  "recomendaciones": [{"prioridad":"Alta|Media|Baja","texto":""}],
  "plan_30_60_90": {"d30":[],"d60":[],"d90":[]},
  "kpis": []
}

Reglas:

hallazgos: 4 a 8
riesgos: 3 a 6
recomendaciones: 6 a 10
plan_30_60_90: 4 acciones por periodo
kpis: texto simple, no objetos
`;
        const completion = await openai.chat.completions.create({
            model: "gpt-4.1-mini",
            temperature: 0.4,
            messages: [{ role: "user", content: prompt }]
        });
        const raw = completion.choices[0]?.message?.content ?? "";
        /**
         * Parse seguro
         */
        const parseJson = (text) => {
            try {
                return JSON.parse(text);
            }
            catch { }
            const a = text.indexOf("{");
            const b = text.lastIndexOf("}");
            if (a >= 0 && b > a)
                return JSON.parse(text.slice(a, b + 1));
            throw new Error("IA no devolvió JSON parseable");
        };
        const data = parseJson(raw);
        return res.json({
            empresaId,
            year,
            month,
            data
        });
    }
    catch (error) {
        console.error(error);
        return res.status(500).json({
            error: "Error generando recomendaciones operativas IA"
        });
    }
}
//# sourceMappingURL=ia-recomendaciones.controller.js.map