// src/routes/equipos.routes.ts
import {
  Router,
  type RequestHandler,
} from "express";
import {
  listEquipos,
  createEquipo,
  getEquipoById,
  updateEquipo,
  deleteEquipo,
  reassignEquipos,
  getEquipoHistorial,
} from "../controllers/equipos.controller.js";

export const equiposRouter = Router();

/* ============ Helpers ============ */
// Async wrapper tipado para capturar rejects sin romper el proceso
const asyncHandler =
  (fn: RequestHandler): RequestHandler =>
    (req, res, next) => {
      Promise.resolve(fn(req, res, next)).catch(next);
    };

// Middleware simple para validar :id numérico
const requireNumericId: RequestHandler = (req, res, next) => {
  const n = Number(req.params.id);
  if (!Number.isFinite(n) || n <= 0) {
    res.status(400).json({ error: "ID inválido" });
    return; // 👈 importante: terminamos la ejecución (retorno void)
  }
  next();
};

/* ============ Rutas ============ */
// Listado (acepta filtros como search, marca, empresaId, empresaName, solicitanteId)
equiposRouter.get("/", asyncHandler(listEquipos));

// Crear
equiposRouter.post("/", asyncHandler(createEquipo));

equiposRouter.patch("/reasignar",asyncHandler(reassignEquipos));

// Leer uno
equiposRouter.get("/:id", requireNumericId, asyncHandler(getEquipoById));

// Actualizar (parcial o total)
equiposRouter.put("/:id", requireNumericId, asyncHandler(updateEquipo));
equiposRouter.patch("/:id", requireNumericId, asyncHandler(updateEquipo));

// Borrar
equiposRouter.delete("/:id", requireNumericId, asyncHandler(deleteEquipo));

equiposRouter.get("/:id/historial", getEquipoHistorial);

export default equiposRouter;
