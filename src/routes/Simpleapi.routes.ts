// src/routes/simpleapi.routes.ts

import { Router } from "express";
import { getVentasRCV, getResumenVentasRCV } from "../controllers/Simpleapi.controller.js";

const router = Router();

// GET /api/facturas/ventas?mes=04&ano=2025
router.get("/ventas", getVentasRCV);

// GET /api/facturas/ventas/resumen?mes=04&ano=2025
router.get("/ventas/resumen", getResumenVentasRCV);

export default router;