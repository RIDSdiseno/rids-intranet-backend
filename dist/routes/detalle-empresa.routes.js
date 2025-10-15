import { Router } from "express";
import { createDetalleEmpresa, getDetallesEmpresa, getDetalleEmpresaById, getDetalleEmpresaByEmpresaId, updateDetalleEmpresa, deleteDetalleEmpresa, } from "../controllers/detalle-empresa.controller.js";
export const detalleEmpresaRouter = Router();
detalleEmpresaRouter.get("/", getDetallesEmpresa);
detalleEmpresaRouter.post("/", createDetalleEmpresa);
detalleEmpresaRouter.get("/:id", getDetalleEmpresaById);
detalleEmpresaRouter.get("/empresa/:empresa_id", getDetalleEmpresaByEmpresaId);
detalleEmpresaRouter.put("/:id", updateDetalleEmpresa);
detalleEmpresaRouter.delete("/:id", deleteDetalleEmpresa);
//# sourceMappingURL=detalle-empresa.routes.js.map