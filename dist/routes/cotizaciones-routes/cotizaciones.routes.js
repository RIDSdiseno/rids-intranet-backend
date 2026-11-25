// src/routes/cotizaciones-routes/cotizaciones.routes.ts
import { Router } from "express";
import { auth, requireAuth, soloLecturaCliente } from "../../middlewares/auth.js";
import { getCotizaciones, getCotizacionById, createCotizacion, updateCotizacion, deleteCotizacion, getCotizacionesPaginadas, facturarCotizacion, anularFactura, pagarFactura, cambiarEstadoFactura, vincularEquipoAItem, } from "../../controllers/controllers-cotizaciones/cotizaciones.controller.js";
import { listCotizacionesEnviadas, createCotizacionEnvio, deleteCotizacionEnvio } from "../../controllers/controllers-cotizaciones/cotizaciones-enviadas.controller.js";
const cotizacionesRouter = Router();
/* Exige sesión (antes casi todo era público) y deja al CLIENTE en solo lectura */
cotizacionesRouter.use(requireAuth);
cotizacionesRouter.use(soloLecturaCliente);
// ── Rutas de solo lectura — CLIENTE puede acceder (filtrado en controller) ───
cotizacionesRouter.get("/", getCotizaciones);
cotizacionesRouter.patch("/items/:itemId/equipo", vincularEquipoAItem);
cotizacionesRouter.get("/paginacion", getCotizacionesPaginadas);
// Rutas para registro y consulta de cotizaciones enviadas (archivo JSON)
// Deben definirse antes de la ruta dinámica "/:id" para evitar colisiones
cotizacionesRouter.get("/enviadas", auth(), listCotizacionesEnviadas);
cotizacionesRouter.post("/enviadas", auth(), createCotizacionEnvio);
cotizacionesRouter.delete("/enviadas/:id", auth(), deleteCotizacionEnvio);
cotizacionesRouter.post("/:id/facturar", facturarCotizacion);
cotizacionesRouter.post("/:id/anular", anularFactura);
cotizacionesRouter.post("/facturas/:id/pagar", pagarFactura);
cotizacionesRouter.get("/:id", getCotizacionById);
cotizacionesRouter.post("/", createCotizacion);
cotizacionesRouter.put("/:id", updateCotizacion);
cotizacionesRouter.delete("/:id", deleteCotizacion);
cotizacionesRouter.patch("/facturas/:id/estado", cambiarEstadoFactura);
export default cotizacionesRouter;
//# sourceMappingURL=cotizaciones.routes.js.map