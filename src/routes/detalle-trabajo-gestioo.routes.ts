import { Router } from "express";
import {
  createDetalleTrabajo,
  getDetallesTrabajo,
  getDetalleTrabajoById,
  updateDetalleTrabajo,
  deleteDetalleTrabajo,
  getDetallesTrabajoByEquipo
} from "../controllers/detalle-trabajo-gestioo.controller.js";

const detalleTrabajoGestiooRouter = Router();

/* ============================
   RUTAS CRUD DETALLE TRABAJO GESTIOO
============================ */
detalleTrabajoGestiooRouter.post("/", createDetalleTrabajo);
detalleTrabajoGestiooRouter.get("/", getDetallesTrabajo);
detalleTrabajoGestiooRouter.get("/:id", getDetalleTrabajoById);
detalleTrabajoGestiooRouter.put("/:id", updateDetalleTrabajo);
detalleTrabajoGestiooRouter.delete("/:id", deleteDetalleTrabajo);
detalleTrabajoGestiooRouter.get("/equipo/:equipoId", getDetallesTrabajoByEquipo);


export default detalleTrabajoGestiooRouter;
