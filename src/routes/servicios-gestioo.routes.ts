// src/routes/servicios-gestioo.routes.ts
import { Router } from "express";
import {
    createServicio,
    getServicios,
    getServicioById,
    updateServicio,
    deleteServicio,
} from "../controllers/servicios-gestioo.controller.js";

const serviciosGestiooRouter = Router();

/* ============================
   RUTAS DE POBLADO DE SERVICIOS GESTIOO
   ============================ */

// Poblar servicios desde JSON
// Poblar servicios desde JSON
// La ruta de seed fue removida porque 'seedServicios' no está exportado desde el controlador.
/* ============================
   CRUD
============================ */
serviciosGestiooRouter.post("/", createServicio);
serviciosGestiooRouter.get("/", getServicios);
serviciosGestiooRouter.get("/:id", getServicioById);
serviciosGestiooRouter.put("/:id", updateServicio);
serviciosGestiooRouter.delete("/:id", deleteServicio);

export default serviciosGestiooRouter;
