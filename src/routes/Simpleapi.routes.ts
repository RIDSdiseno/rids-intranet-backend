// src/routes/simpleapi.routes.ts

import { Router } from "express";

import {
  getVentasRCV,
  getResumenVentasRCV,
  getComprasRCV,
  getResumenComprasRCV,
} from "../controllers/Simpleapi.controller.js";

const router = Router();

// GET /api/facturas/ventas?mes=04&ano=2025
router.get("/ventas", getVentasRCV);

// GET /api/facturas/ventas/resumen?mes=04&ano=2025
router.get("/ventas/resumen", getResumenVentasRCV);

// GET /api/facturas/compras?mes=04&ano=2025
router.get("/compras", getComprasRCV);

// GET /api/facturas/compras/resumen?mes=04&ano=2025
router.get("/compras/resumen", getResumenComprasRCV);

export default router;