// routes/solicitantes.routes.ts
import { Router } from "express";
import { listSolicitantes, listSolicitantesByEmpresa, solicitantesMetrics, createSolicitante, checkSolicitanteEmail, getSolicitanteById, updateSolicitante, deleteSolicitante, getSolicitantesDashboardMensual, getSolicitantesEliminadosDetalle, getSolicitantesNuevosDetalle } from "../controllers/solicitantes.controller.js";
import { auth } from "../middlewares/auth.js";
export const solicitantesRouter = Router();
const asyncHandler = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
solicitantesRouter.use(auth());
solicitantesRouter.get("/", asyncHandler(listSolicitantes));
solicitantesRouter.get("/by-empresa", asyncHandler(listSolicitantesByEmpresa));
solicitantesRouter.get("/metrics", asyncHandler(solicitantesMetrics));
solicitantesRouter.get("/check-email", asyncHandler(checkSolicitanteEmail));
solicitantesRouter.post("/", asyncHandler(createSolicitante));
solicitantesRouter.get("/dashboard/mensual", asyncHandler(getSolicitantesDashboardMensual));
solicitantesRouter.get("/dashboard/nuevos", asyncHandler(getSolicitantesNuevosDetalle));
solicitantesRouter.get("/dashboard/eliminados", asyncHandler(getSolicitantesEliminadosDetalle));
solicitantesRouter.get("/:id", asyncHandler(getSolicitanteById));
solicitantesRouter.patch("/:id", asyncHandler(updateSolicitante));
solicitantesRouter.delete("/:id", asyncHandler(deleteSolicitante));
export default solicitantesRouter;
//# sourceMappingURL=solicitantes.routes.js.map