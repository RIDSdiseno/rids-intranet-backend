// routes/solicitantes.routes.ts
import { Router, type RequestHandler } from "express";
import {
  listSolicitantes,
  listSolicitantesByEmpresa,
  solicitantesMetrics,
  createSolicitante,
  getSolicitanteById,
  updateSolicitante,
  deleteSolicitante,
} from "../controllers/solicitantes.controller.js"; // <-- PLURAL y .js en runtime

export const solicitantesRouter = Router();
const asyncHandler =
  (fn: any): RequestHandler =>
  (req, res, next) =>
    Promise.resolve(fn(req, res, next)).catch(next);

solicitantesRouter.get("/", asyncHandler(listSolicitantes));
solicitantesRouter.get("/by-empresa", asyncHandler(listSolicitantesByEmpresa));
solicitantesRouter.get("/metrics", asyncHandler(solicitantesMetrics));
solicitantesRouter.post("/", asyncHandler(createSolicitante));
solicitantesRouter.get("/:id", asyncHandler(getSolicitanteById));
solicitantesRouter.patch("/:id", asyncHandler(updateSolicitante));
solicitantesRouter.delete("/:id", asyncHandler(deleteSolicitante));

export default solicitantesRouter;
