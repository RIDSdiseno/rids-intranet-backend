import { Router, } from "express";
import { onlyRole, } from "../../middlewares/roles.js";
import { crearOportunidadController, listarOportunidadesController, obtenerFunnelController, obtenerDashboardController, obtenerOportunidadController, editarOportunidadController, cambiarEtapaController, reordenarController, eliminarOportunidadController, crearSeguimientoController, listarSeguimientosController, obtenerHistorialController, listarCotizacionesController, vincularCotizacionController, desvincularCotizacionController, crearOportunidadDesdeCotizacionController, cambiarEstadoSeguimientoController, enviarInformeOportunidadController, } from "../../controllers/controllers-oportunidades/oportunidades.controller.js";
/*
 * Roles internos habilitados
 * para el Funnel comercial.
 */
const ROLES_OPORTUNIDADES = [
    "ADMIN",
    "ADMINISTRACION",
    "VENTAS",
];
const oportunidadesRouter = Router();
/*
 * Autorización centralizada
 * para todo el módulo.
 */
oportunidadesRouter.use(onlyRole(...ROLES_OPORTUNIDADES));
/* =========================================================
   CREACIÓN DESDE COTIZACIÓN
========================================================= */
oportunidadesRouter.post("/desde-cotizacion/:cotizacionId", crearOportunidadDesdeCotizacionController);
/* =========================================================
   RUTAS GENERALES / ESPECÍFICAS
========================================================= */
oportunidadesRouter.get("/funnel", obtenerFunnelController);
oportunidadesRouter.get("/dashboard", obtenerDashboardController);
oportunidadesRouter.get("/", listarOportunidadesController);
oportunidadesRouter.post("/", crearOportunidadController);
/* =========================================================
   SEGUIMIENTOS
========================================================= */
oportunidadesRouter.post("/:id/seguimientos", crearSeguimientoController);
oportunidadesRouter.get("/:id/seguimientos", listarSeguimientosController);
oportunidadesRouter.patch("/:id/seguimientos/:seguimientoId/estado", cambiarEstadoSeguimientoController);
/* =========================================================
   HISTORIAL
========================================================= */
oportunidadesRouter.get("/:id/historial", obtenerHistorialController);
/* =========================================================
   COTIZACIONES VINCULADAS
========================================================= */
oportunidadesRouter.get("/:id/cotizaciones", listarCotizacionesController);
oportunidadesRouter.post("/:id/cotizaciones/:cotizacionId", vincularCotizacionController);
oportunidadesRouter.delete("/:id/cotizaciones/:cotizacionId", desvincularCotizacionController);
/* =========================================================
   INFORME DE RESPALDO
========================================================= */
oportunidadesRouter.post("/:id/informe/enviar", enviarInformeOportunidadController);
/* =========================================================
   ETAPA Y ORDEN
========================================================= */
oportunidadesRouter.patch("/:id/etapa", cambiarEtapaController);
oportunidadesRouter.patch("/:id/orden", reordenarController);
/* =========================================================
   CRUD POR ID
========================================================= */
oportunidadesRouter.get("/:id", obtenerOportunidadController);
oportunidadesRouter.patch("/:id", editarOportunidadController);
oportunidadesRouter.delete("/:id", eliminarOportunidadController);
export default oportunidadesRouter;
//# sourceMappingURL=oportunidades.routes.js.map