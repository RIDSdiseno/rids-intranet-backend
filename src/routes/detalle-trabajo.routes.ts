import { Router } from "express";
import {
  createDetalleTrabajo,
  getDetallesTrabajo,
  getDetalleTrabajoById,
  updateDetalleTrabajo,
  deleteDetalleTrabajo,
} from "../controllers/detalle-trabajo.controller.js";

export const detalleTrabajoRouter = Router();

detalleTrabajoRouter.get("/", getDetallesTrabajo);
detalleTrabajoRouter.post("/", createDetalleTrabajo);
detalleTrabajoRouter.get("/:id", getDetalleTrabajoById);
detalleTrabajoRouter.put("/:id", updateDetalleTrabajo);
detalleTrabajoRouter.delete("/:id", deleteDetalleTrabajo);