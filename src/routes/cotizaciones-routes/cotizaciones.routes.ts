// src/routes/cotizaciones-routes/cotizaciones.routes.ts
import { Router } from "express";
import { auth } from "../../middlewares/auth.js";
import { onlyRole } from "../../middlewares/roles.js";
import { onlyOwnEmpresa } from "../../middlewares/auth.js";

import {
    getCotizaciones,
    getCotizacionById,
    createCotizacion,
    updateCotizacion,
    deleteCotizacion,
    getCotizacionesPaginadas,
    facturarCotizacion,
    anularFactura,
    pagarFactura,
    cambiarEstadoFactura,
    vincularEquipoAItem,
} from "../../controllers/controllers-cotizaciones/cotizaciones.controller.js";
import { listCotizacionesEnviadas, createCotizacionEnvio, deleteCotizacionEnvio } from "../../controllers/cotizaciones-enviadas.controller.js";

const cotizacionesRouter = Router();

const ROLES_INTERNOS = ["ADMIN", "ADMINISTRACION", "TECNICO", "VENTAS"] as const;
const ROLES_ADMIN = ["ADMIN", "ADMINISTRACION"] as const;
const ROLES_FACTURA = ["ADMIN", "ADMINISTRACION", "VENTAS"] as const;

// ── Rutas de solo lectura — CLIENTE puede acceder (filtrado en controller) ───

cotizacionesRouter.get("/", getCotizaciones);
cotizacionesRouter.patch("/items/:itemId/equipo", vincularEquipoAItem)
cotizacionesRouter.get("/paginacion", getCotizacionesPaginadas);
cotizacionesRouter.post("/:id/facturar", facturarCotizacion);
cotizacionesRouter.post("/:id/anular", anularFactura);
cotizacionesRouter.post("/facturas/:id/pagar", pagarFactura);
cotizacionesRouter.get("/:id", getCotizacionById);
cotizacionesRouter.post("/", createCotizacion);
cotizacionesRouter.put("/:id", updateCotizacion);
cotizacionesRouter.delete("/:id", deleteCotizacion);
cotizacionesRouter.patch("/facturas/:id/estado", cambiarEstadoFactura);

export default cotizacionesRouter;