// src/routes/cotizaciones.routes.ts
import { Router } from "express";
import { auth } from "../middlewares/auth.js";
import { onlyRole } from "../middlewares/roles.js";
import { onlyOwnEmpresa } from "../middlewares/auth.js";
import { getCotizaciones, getCotizacionById, createCotizacion, updateCotizacion, deleteCotizacion, getCotizacionesPaginadas, facturarCotizacion, anularFactura, pagarFactura, cambiarEstadoFactura, vincularEquipoAItem, } from "../controllers/cotizaciones.controller.js";
const cotizacionesRouter = Router();
const ROLES_INTERNOS = ["ADMIN", "ADMINISTRACION", "TECNICO", "VENTAS"];
const ROLES_ADMIN = ["ADMIN", "ADMINISTRACION"];
const ROLES_FACTURA = ["ADMIN", "ADMINISTRACION", "VENTAS"];
// ── Rutas de solo lectura — CLIENTE puede acceder (filtrado en controller) ───
cotizacionesRouter.get("/paginacion", auth(), onlyOwnEmpresa(), getCotizacionesPaginadas);
cotizacionesRouter.get("/", auth(), onlyOwnEmpresa(), getCotizaciones);
cotizacionesRouter.get("/:id", auth(), onlyOwnEmpresa(), getCotizacionById);
// ── Creación y edición — solo internos ───────────────────────────────────────
cotizacionesRouter.post("/", auth(), onlyRole(...ROLES_INTERNOS), createCotizacion);
cotizacionesRouter.put("/:id", auth(), onlyRole(...ROLES_INTERNOS), updateCotizacion);
// ── Eliminar — solo ADMIN ────────────────────────────────────────────────────
cotizacionesRouter.delete("/:id", auth(), onlyRole(...ROLES_ADMIN), deleteCotizacion);
// ── Facturación — solo roles de facturación ──────────────────────────────────
cotizacionesRouter.post("/:id/facturar", auth(), onlyRole(...ROLES_FACTURA), facturarCotizacion);
cotizacionesRouter.post("/:id/anular", auth(), onlyRole(...ROLES_FACTURA), anularFactura);
cotizacionesRouter.post("/facturas/:id/pagar", auth(), onlyRole(...ROLES_FACTURA), pagarFactura);
cotizacionesRouter.patch("/facturas/:id/estado", auth(), onlyRole(...ROLES_FACTURA), cambiarEstadoFactura);
// ── Vincular equipo a item — solo internos ───────────────────────────────────
cotizacionesRouter.patch("/items/:itemId/equipo", auth(), onlyRole(...ROLES_INTERNOS), vincularEquipoAItem);
export default cotizacionesRouter;
//# sourceMappingURL=cotizaciones.routes.js.map