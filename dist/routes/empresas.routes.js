// src/routes/empresas.routes.ts
import { Router } from "express";
import { getEmpresas, getEmpresaById, createEmpresa, updateEmpresa, deleteEmpresa, getEmpresasStats, } from "../controllers/empresas.controller.js";
import { getEquiposByEmpresa, } from "../controllers/equipos.controller.js";
import { auth } from "../middlewares/auth.js";
export const empresasRouter = Router();
empresasRouter.use(auth());
empresasRouter.get("/", getEmpresas);
empresasRouter.get("/stats", getEmpresasStats);
empresasRouter.post("/", createEmpresa);
empresasRouter.get("/:id", getEmpresaById);
empresasRouter.put("/:id", updateEmpresa);
empresasRouter.delete("/:id", deleteEmpresa);
empresasRouter.get("/:empresaId/equipos", getEquiposByEmpresa);
export default empresasRouter;
//# sourceMappingURL=empresas.routes.js.map