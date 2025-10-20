// routes/solicitantes.routes.ts
import { Router } from "express";
import {
  listSolicitantes,
  listSolicitantesByEmpresa,
  solicitantesMetrics,
  createSolicitante,
  getSolicitanteById,
  updateSolicitante,
  deleteSolicitante,
} from "../controllers/solicitante.controller.js"; // ← ajusta si usas nombre singular

export const solicitantesRouter = Router();

// Helper para manejar Promises sin try/catch en cada ruta
const asyncHandler =
  (fn: any) =>
  (req: any, res: any, next: any) =>
    Promise.resolve(fn(req, res, next)).catch(next);

/**
 * GET /solicitantes
 * Listado paginado (q, empresaId, page, pageSize)
 */
solicitantesRouter.get("/", asyncHandler(listSolicitantes));

/**
 * GET /solicitantes/by-empresa?empresaId=1&q=foo
 * Lista mini para selects: [{ id, nombre }]
 */
solicitantesRouter.get("/by-empresa", asyncHandler(listSolicitantesByEmpresa));

/**
 * GET /solicitantes/metrics
 * Métricas rápidas (totales, empresas distintas, equipos)
 */
solicitantesRouter.get("/metrics", asyncHandler(solicitantesMetrics));

/**
 * POST /solicitantes
 * body: { nombre: string, email?: string, empresaId: number }
 */
solicitantesRouter.post("/", asyncHandler(createSolicitante));

/**
 * GET /solicitantes/:id
 * Obtiene un solicitante con empresa y equipos
 */
solicitantesRouter.get("/:id", asyncHandler(getSolicitanteById));

/**
 * PATCH /solicitantes/:id
 * body: { nombre?: string, email?: string|null, empresaId?: number }
 */
solicitantesRouter.patch("/:id", asyncHandler(updateSolicitante));

/**
 * DELETE /solicitantes/:id
 * Opciones:
 *  - ?transferToId=123 → transfiere TODO a ese solicitante
 *  - sin transferToId:
 *      - NO-NULL (equipos/historial/maps) → a “S/A” de la empresa (se crea si no existe)
 *      - NULLables (tickets/visitas): ?fallback=null (default) o ?fallback=sa
 */
solicitantesRouter.delete("/:id", asyncHandler(deleteSolicitante));

export default solicitantesRouter;
