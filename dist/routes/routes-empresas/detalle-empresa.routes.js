// Rutas para manejo de detalles de empresa, con endpoints para CRUD completo y consulta por empresa, delegando la lógica al controlador correspondiente
import { Router } from "express";
import { requireAuth } from "../../middlewares/auth.js";
import { onlyRole } from "../../middlewares/roles.js";
import { createDetalleEmpresa, getDetallesEmpresa, getDetalleEmpresaById, getDetalleEmpresaByEmpresaId, updateDetalleEmpresa, deleteDetalleEmpresa, } from "../../controllers/controllers-empresas/detalle-empresa.controller.js";
export const detalleEmpresaRouter = Router();
/* Antes sin autenticación (RUT y datos de todas las empresas). Solo internos */
detalleEmpresaRouter.use(requireAuth);
detalleEmpresaRouter.use(onlyRole("ADMIN", "ADMINISTRACION", "TECNICO", "VENTAS"));
detalleEmpresaRouter.get("/", getDetallesEmpresa);
detalleEmpresaRouter.post("/", createDetalleEmpresa);
detalleEmpresaRouter.get("/:id", getDetalleEmpresaById);
detalleEmpresaRouter.get("/empresa/:empresa_id", getDetalleEmpresaByEmpresaId);
detalleEmpresaRouter.put("/:id", updateDetalleEmpresa);
detalleEmpresaRouter.delete("/:id", deleteDetalleEmpresa);
//# sourceMappingURL=detalle-empresa.routes.js.map