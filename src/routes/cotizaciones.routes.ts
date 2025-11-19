import { Router } from "express";
import {
    getCotizaciones,
    getCotizacionById,
    createCotizacion,
    updateCotizacion,
    deleteCotizacion,
} from "../controllers/cotizaciones.controller.js";

const cotizacionesRouter = Router();

/* ============================
   RUTAS CRUD COTIZACION GESTIOO
============================ */
cotizacionesRouter.get("/", getCotizaciones);
cotizacionesRouter.get("/:id", getCotizacionById);
cotizacionesRouter.post("/", createCotizacion);
cotizacionesRouter.put("/:id", updateCotizacion);
cotizacionesRouter.delete("/:id", deleteCotizacion);

export default cotizacionesRouter;
