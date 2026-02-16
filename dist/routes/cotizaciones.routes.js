import { Router } from "express";
import { auth } from "../middlewares/auth.js"; // 🔥 IMPORTANTE
import { getCotizaciones, getCotizacionById, createCotizacion, updateCotizacion, deleteCotizacion, getCotizacionesPaginadas } from "../controllers/cotizaciones.controller.js";
const cotizacionesRouter = Router();
/* ============================
   RUTAS CRUD COTIZACION GESTIOO
============================ */
// 🔐 PROTEGER TODO EL ROUTER
cotizacionesRouter.use(auth());
cotizacionesRouter.get("/", getCotizaciones);
cotizacionesRouter.get("/cotizaciones/paginacion", getCotizacionesPaginadas);
cotizacionesRouter.get("/:id", getCotizacionById);
cotizacionesRouter.post("/", createCotizacion);
cotizacionesRouter.put("/:id", updateCotizacion);
cotizacionesRouter.delete("/:id", deleteCotizacion);
export default cotizacionesRouter;
//# sourceMappingURL=cotizaciones.routes.js.map