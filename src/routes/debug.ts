// src/routes/debug.ts
import { Router } from "express";
import { consultarVentasRCV } from "../service/simple-api/simpleapi.service.js";

export const debugRouter = Router();

debugRouter.get("/secret", (_req, res) => {
  const sec = process.env.FD_WEBHOOK_SECRET ?? "";
  res.json({ present: !!sec, length: sec.length });
});

// Debug: consulta SimpleAPI/RCV directamente (SIN AUTH) para inspección rápida
debugRouter.get("/facturas/ventas", async (req, res) => {
  try {
    const mes = String(req.query.mes ?? "");
    const ano = String(req.query.ano ?? "");
    const empresa = String((req.query.empresa ?? "").toLowerCase() ?? "");
    const force = req.query.refresh === "true" || req.query.force === "true";

    if (!mes || !ano || !empresa) {
      return res.status(400).json({ ok: false, error: "Parámetros requeridos: mes, ano, empresa" });
    }

    // resolver rutEmpresa desde env (mismo comportamiento que controller)
    const rutEmpresa =
      (empresa === "econnet" && (process.env.ECONNET_RUT_EMPRESA ?? process.env.RUT_EMPRESA)) ||
      (empresa === "rids" && process.env.RIDS_RUT_EMPRESA) ||
      "";

    if (!rutEmpresa) {
      return res.status(400).json({ ok: false, error: `Empresa inválida o sin RUT configurado: ${empresa}` });
    }

    const result = await consultarVentasRCV(mes, ano, empresa, String(rutEmpresa), force);

    res.json({ ok: true, source: result.source, total: result.data?.total ?? 0, data: result.data });
  } catch (err: any) {
    console.error("[DEBUG] error facturas/ventas:", err);
    res.status(500).json({ ok: false, error: err?.message ?? String(err) });
  }
});
