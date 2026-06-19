// src/routes/empresas.routes.ts
import { Router } from "express";
import { getEmpresas, getEmpresaById, createEmpresa, updateEmpresa, deleteEmpresa, getEmpresasStats, } from "../controllers/empresas.controller.js";
import { getEquiposByEmpresa, } from "../controllers/equipos.controller.js";
import { getEmpresaDashboard } from "../controllers/controllers-empresas/dashboard-empresa.controller.js";
import { getSoporteMensualPorEmpresa } from "../controllers/controllers-empresas/soporte-mensual-empresas-table.controller.js";
import { onlyRole } from "../middlewares/roles.js";
import { auth } from "../middlewares/auth.js";
export const empresasRouter = Router();
empresasRouter.use(auth());
empresasRouter.get("/", getEmpresas);
empresasRouter.get("/stats", getEmpresasStats);
empresasRouter.post("/", createEmpresa);
empresasRouter.get("/soporte-mensual", getSoporteMensualPorEmpresa);
empresasRouter.get("/:id", getEmpresaById);
empresasRouter.put("/:id", updateEmpresa);
empresasRouter.delete("/:id", deleteEmpresa);
empresasRouter.get("/:empresaId/equipos", getEquiposByEmpresa);
empresasRouter.get("/:id/dashboard", auth(), onlyRole("ADMIN", "ADMINISTRACION", "TECNICO", "VENTAS", "CLIENTE"), getEmpresaDashboard);
export default empresasRouter;
//# sourceMappingURL=empresas.routes.js.map