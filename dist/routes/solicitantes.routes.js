import { Router } from "express";
import { listSolicitantes, listSolicitantesByEmpresa, } from "../controllers/solicitante.controller.js";
export const solicitantesRouter = Router();
solicitantesRouter.get("/mini", (req, res, next) => {
    Promise.resolve(listSolicitantesByEmpresa(req, res)).catch(next);
});
solicitantesRouter.get("/", (req, res, next) => {
    Promise.resolve(listSolicitantes(req, res)).catch(next);
});
//# sourceMappingURL=solicitantes.routes.js.map