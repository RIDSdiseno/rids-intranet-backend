import type { Request, Response } from "express";
import { buildReporteEmpresaData } from "../../service/ia-metricas-reportes/reportEmpresa.service.js";
import { generarEstructuraWordIABeta } from "../../service/ia-metricas-reportes/ia-reportes-docx-beta.service.js";

export async function generarInformeWordIABeta(req: Request, res: Response) {
  try {
    const empresaId = Number(req.params.empresaId);
    const year = Number(req.params.year);
    const month = Number(req.params.month);

    if (!empresaId || !year || !month) {
      return res.status(400).json({ error: "Parámetros inválidos" });
    }

    const periodo = `${year}-${String(month).padStart(2, "0")}`;
    const reporte = await buildReporteEmpresaData(empresaId, periodo);
    const estructura = await generarEstructuraWordIABeta(reporte);

    return res.json({
      empresaId,
      periodo,
      data: estructura,
    });
  } catch (error) {
    console.error("❌ generarInformeWordIABeta error:", error);
    return res.status(500).json({
      error: "Error generando Word IA beta",
    });
  }
}
