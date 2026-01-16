import { Router } from "express";
import { getReporteEmpresa } from "../controllers/reportes.controller.js";
import { exportReportesForSharepoint } from "../controllers/reportes-export.controller.js";

const router = Router();

// Web / Dashboard
router.get("/empresa/:empresaId", getReporteEmpresa);

// Automatización / Power Automate
router.post("/export/sharepoint", exportReportesForSharepoint);

export default router;
