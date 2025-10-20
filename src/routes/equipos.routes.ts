// src/routes/equipos.routes.ts
import { Router, type Request, type Response, type NextFunction } from "express";
import {
  listEquipos,
  createEquipo,
  getEquipoById,
  updateEquipo,
  deleteEquipo,
} from "../controllers/equipos.controller.js";

export const equiposRouter = Router();

// Middleware simple para validar :id numérico
function requireNumericId(req: Request, res: Response, next: NextFunction) {
  const n = Number(req.params.id);
  if (!Number.isFinite(n) || n <= 0) {
    return res.status(400).json({ error: "ID inválido" });
  }
  next();
}

// Listado (acepta filtros como search, marca, empresaId, empresaName, solicitanteId)
equiposRouter.get("/", listEquipos);

// Crear
equiposRouter.post("/", createEquipo);

// Leer uno
equiposRouter.get("/:id", requireNumericId, getEquipoById);

// Actualizar (parcial o total)
equiposRouter.put("/:id", requireNumericId, updateEquipo);
equiposRouter.patch("/:id", requireNumericId, updateEquipo);

// Borrar
equiposRouter.delete("/:id", requireNumericId, deleteEquipo);
