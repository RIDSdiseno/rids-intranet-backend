// src/routes/routes-empresas/grupos-empresa.routes.ts
// Grupos de empresas (G1). Lectura: usuarios internos. Escritura: solo ADMIN.
import { Router } from "express";
import { listarGruposEmpresa, crearGrupoEmpresa, actualizarGrupoEmpresa, eliminarGrupoEmpresa, } from "../../controllers/controllers-empresas/grupos-empresa.controller.js";
import { onlyRole } from "../../middlewares/roles.js";
import { auth } from "../../middlewares/auth.js";
export const gruposEmpresaRouter = Router();
gruposEmpresaRouter.use(auth());
gruposEmpresaRouter.get("/", onlyRole("ADMIN", "ADMINISTRACION", "TECNICO", "VENTAS"), listarGruposEmpresa);
gruposEmpresaRouter.post("/", onlyRole("ADMIN", "ADMINISTRACION"), crearGrupoEmpresa);
gruposEmpresaRouter.put("/:id", onlyRole("ADMIN", "ADMINISTRACION"), actualizarGrupoEmpresa);
gruposEmpresaRouter.delete("/:id", onlyRole("ADMIN", "ADMINISTRACION"), eliminarGrupoEmpresa);
export default gruposEmpresaRouter;
//# sourceMappingURL=grupos-empresa.routes.js.map