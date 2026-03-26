import { Router } from "express";
import { auth } from "../middlewares/auth.js"; //  IMPORTANTE

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
    consultarEstadoSII,
    vincularFacturaSII,
    consultarEnvioSII,
    emitirFacturaSII,
    cambiarEstadoFactura,
    vincularEquipoAItem
} from "../controllers/cotizaciones.controller.js";

const cotizacionesRouter = Router();

/* ============================
   RUTAS CRUD COTIZACION GESTIOO
============================ */

// 🔐 PROTEGER TODO EL ROUTER
cotizacionesRouter.use(auth());

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
cotizacionesRouter.post("/:id/emitir-sii", emitirFacturaSII);
cotizacionesRouter.post("/facturas/:id/consultar-envio", consultarEnvioSII);
cotizacionesRouter.post("/:id/vincular-factura-sii", vincularFacturaSII);
cotizacionesRouter.post("/facturas/:id/consultar-sii", consultarEstadoSII);
cotizacionesRouter.patch("/facturas/:id/estado", cambiarEstadoFactura);

export default cotizacionesRouter;
