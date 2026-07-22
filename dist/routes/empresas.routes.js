// src/routes/empresas.routes.ts
import { Router } from "express";
import { getEmpresas, getEmpresaById, createEmpresa, updateEmpresa, updateEmpresaStatus, deleteEmpresa, getEmpresasStats, } from "../controllers/empresas.controller.js";
import { getEquiposByEmpresa, } from "../controllers/equipos.controller.js";
import { getEmpresaDashboard, } from "../controllers/controllers-empresas/dashboard-empresa.controller.js";
import { getSoporteMensualPorEmpresa, } from "../controllers/controllers-empresas/soporte-mensual-empresas-table.controller.js";
import { onlyRole } from "../middlewares/roles.js";
import { auth } from "../middlewares/auth.js";
export const empresasRouter = Router();
/*
 * Todas las rutas de este router requieren autenticación.
 */
empresasRouter.use(auth());
/*
 * Rutas fijas antes de las rutas dinámicas.
 */
empresasRouter.get("/stats", getEmpresasStats);
empresasRouter.get("/soporte-mensual", getSoporteMensualPorEmpresa);
/*
 * Listado y creación.
 */
empresasRouter.get("/", getEmpresas);
empresasRouter.post("/", onlyRole("ADMIN", "ADMINISTRACION"), createEmpresa);
/*
 * Activar o desactivar una empresa.
 */
empresasRouter.patch("/:id/status", onlyRole("ADMIN", "ADMINISTRACION"), updateEmpresaStatus);
/*
 * Rutas relacionadas con una empresa.
 */
empresasRouter.get("/:empresaId/equipos", getEquiposByEmpresa);
empresasRouter.get("/:id/dashboard", onlyRole("ADMIN", "ADMINISTRACION", "TECNICO", "VENTAS", "CLIENTE"), getEmpresaDashboard);
/*
 * CRUD principal.
 */
empresasRouter.get("/:id", getEmpresaById);
empresasRouter.put("/:id", onlyRole("ADMIN", "ADMINISTRACION"), updateEmpresa);
/*
 * DELETE ahora ejecuta una desactivación lógica.
 */
empresasRouter.delete("/:id", onlyRole("ADMIN", "ADMINISTRACION"), deleteEmpresa);
export default empresasRouter;
//# sourceMappingURL=empresas.routes.js.map