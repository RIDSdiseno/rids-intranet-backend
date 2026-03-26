import { Router } from "express";
import { generarInformeOperativoIA } from "../../controllers/ia-intranet-controller/ia-reportes.controller.js";

const iaReportesRouter = Router();

/**
 * =====================================================
 * 🤖 IA REPORTES
 * =====================================================
 */

/**
 * Generar informe operativo con IA
 * Usa cache si ya existe
 */
iaReportesRouter.get(
  "/informe-operativo/:empresaId/:year/:month",
  generarInformeOperativoIA
);

export default iaReportesRouter;