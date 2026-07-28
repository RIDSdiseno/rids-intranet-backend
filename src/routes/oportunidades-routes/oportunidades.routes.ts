// src/routes/oportunidades-routes/oportunidades.routes.ts
import { Router } from "express";
import { onlyRole } from "../../middlewares/roles.js";
import {
  crearOportunidadController,
  listarOportunidadesController,
  obtenerFunnelController,
  obtenerDashboardController,
  obtenerOportunidadController,
  editarOportunidadController,
  cambiarEtapaController,
  reordenarController,
  eliminarOportunidadController,
  crearSeguimientoController,
  listarSeguimientosController,
  obtenerHistorialController,
  listarCotizacionesController,
  vincularCotizacionController,
  desvincularCotizacionController,
} from "../../controllers/controllers-oportunidades/oportunidades.controller.js";

// Roles internos habilitados para el funnel comercial en esta primera versión.
// Deliberadamente NO se habilita CLIENTE ni TECNICO (ver auditoría previa).
const ROLES_OPORTUNIDADES = ["ADMIN", "ADMINISTRACION", "VENTAS"] as const;

const oportunidadesRouter = Router();

// Autorización centralizada para todo el módulo.
oportunidadesRouter.use(onlyRole(...ROLES_OPORTUNIDADES));

// --- Rutas específicas antes de las dinámicas con :id ---
oportunidadesRouter.get("/funnel", obtenerFunnelController);
oportunidadesRouter.get("/dashboard", obtenerDashboardController);
oportunidadesRouter.get("/", listarOportunidadesController);
oportunidadesRouter.post("/", crearOportunidadController);

// --- Seguimientos ---
oportunidadesRouter.post("/:id/seguimientos", crearSeguimientoController);
oportunidadesRouter.get("/:id/seguimientos", listarSeguimientosController);

// --- Historial ---
oportunidadesRouter.get("/:id/historial", obtenerHistorialController);

// --- Cotizaciones vinculadas ---
oportunidadesRouter.get("/:id/cotizaciones", listarCotizacionesController);
oportunidadesRouter.post("/:id/cotizaciones/:cotizacionId", vincularCotizacionController);
oportunidadesRouter.delete("/:id/cotizaciones/:cotizacionId", desvincularCotizacionController);

// --- Etapa y orden ---
oportunidadesRouter.patch("/:id/etapa", cambiarEtapaController);
oportunidadesRouter.patch("/:id/orden", reordenarController);

// --- CRUD por id ---
oportunidadesRouter.get("/:id", obtenerOportunidadController);
oportunidadesRouter.patch("/:id", editarOportunidadController);
oportunidadesRouter.delete("/:id", eliminarOportunidadController);

export default oportunidadesRouter;
