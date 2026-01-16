import type { Request, Response } from "express";
import { buildReporteEmpresaData } from "../service/reportEmpresa.service.js";

export async function getReporteEmpresa(req: Request, res: Response) {
  try {
    const empresaId = Number(req.params.empresaId);
    const ym = String(req.query.month || "").trim(); // YYYY-MM

    if (!Number.isInteger(empresaId) || empresaId <= 0) {
      return res.status(400).json({ error: "empresaId inválido" });
    }

    if (!/^\d{4}-\d{2}$/.test(ym)) {
      return res.status(400).json({ error: "month debe ser YYYY-MM" });
    }

    const data = await buildReporteEmpresaData(empresaId, ym);
    return res.json(data);

  } catch (err: any) {
    console.error("getReporteEmpresa error:", err);
    return res.status(500).json({
      error: err?.message ?? "Error interno",
    });
  }
}
