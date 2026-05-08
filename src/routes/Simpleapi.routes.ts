// src/routes/simpleapi.routes.ts

import { Router } from "express";

import {
  getVentasRCV,
  getResumenVentasRCV,
  getComprasRCV,
  getResumenComprasRCV,
} from "../controllers/Simpleapi.controller.js";
import { auth } from "../middlewares/auth.js";

import { onlyRole } from "../middlewares/roles.js";
import { ROLE_GROUPS } from "../constant/roles.js";

const router = Router();

// GET /api/facturas/ventas?mes=04&ano=2025
router.get(
  "/ventas",
  auth(),
  onlyRole(...ROLE_GROUPS.FACTURACION),
  getVentasRCV
);

// GET /api/facturas/ventas/resumen?mes=04&ano=2025
router.get(
  "/ventas/resumen",
  auth(),
  onlyRole(...ROLE_GROUPS.FACTURACION),
  getResumenVentasRCV
);

// GET /api/facturas/compras?mes=04&ano=2025
router.get(
  "/compras",
  auth(),
  onlyRole(...ROLE_GROUPS.FACTURACION),
  getComprasRCV
);

// GET /api/facturas/compras/resumen?mes=04&ano=2025
router.get(
  "/compras/resumen",
  auth(),
  onlyRole(...ROLE_GROUPS.FACTURACION),
  getResumenComprasRCV
);

export default router;