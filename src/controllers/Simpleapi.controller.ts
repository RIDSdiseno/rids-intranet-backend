// src/controllers/simpleapi.controller.ts

import type { Request, Response } from "express";
import {
  consultarVentasRCV,
  consultarResumenVentasRCV,
} from "../service/simple-api/simpleapi.service.js";

// Mapa de empresas permitidas
const EMPRESAS_PERMITIDAS: Record<string, string> = {
  econnet: process.env.RUT_EMPRESA ?? "",
  rids: process.env.RIDS_RUT_EMPRESA ?? "",
};

// ============================================================
// GET /api/facturas/ventas?mes=04&ano=2025&empresa=rids&refresh=true
// refresh=true fuerza nueva consulta al SII (gasta token)
// Sin refresh=true devuelve caché si existe
// ============================================================
export async function getVentasRCV(req: Request, res: Response): Promise<void> {
  try {
    const mes = req.query.mes as string;
    const ano = req.query.ano as string;
    const empresa = (req.query.empresa as string | undefined)?.toLowerCase();
    const forceRefresh = req.query.refresh === "true";

    if (!mes || !ano) {
      res.status(400).json({
        ok: false,
        error: "Parámetros requeridos: mes (01-12) y ano (ej: 2025)",
      });
      return;
    }

    const rutEmpresa = empresa && EMPRESAS_PERMITIDAS[empresa]
      ? EMPRESAS_PERMITIDAS[empresa]
      : undefined;

    console.log("🏢 empresa:", empresa, "| rut:", rutEmpresa, "| forceRefresh:", forceRefresh);

    const resultado = await consultarVentasRCV(mes, ano, rutEmpresa, forceRefresh);

    res.json({
      ok: true,
      data: resultado,
    });
  } catch (error: any) {
    console.error("❌ Error consultando ventas RCV:", error?.message ?? error);
    res.status(500).json({
      ok: false,
      error: error?.message ?? "Error interno al consultar ventas",
    });
  }
}

// ============================================================
// GET /api/facturas/ventas/resumen?mes=04&ano=2025&empresa=rids
// ============================================================
export async function getResumenVentasRCV(req: Request, res: Response): Promise<void> {
  try {
    const mes = req.query.mes as string;
    const ano = req.query.ano as string;
    const empresa = (req.query.empresa as string | undefined)?.toLowerCase();

    if (!mes || !ano) {
      res.status(400).json({
        ok: false,
        error: "Parámetros requeridos: mes (01-12) y ano (ej: 2025)",
      });
      return;
    }

    const rutEmpresa = empresa && EMPRESAS_PERMITIDAS[empresa]
      ? EMPRESAS_PERMITIDAS[empresa]
      : undefined;

    const resultado = await consultarResumenVentasRCV(mes, ano, rutEmpresa);

    res.json({
      ok: true,
      data: resultado,
    });
  } catch (error: any) {
    console.error("❌ Error consultando resumen RCV:", error?.message ?? error);
    res.status(500).json({
      ok: false,
      error: error?.message ?? "Error interno al consultar resumen",
    });
  }
}