// Rutas para manejo de detalles de empresa, con endpoints para CRUD completo y consulta por empresa, delegando la lógica al controlador correspondiente
import { Router } from "express";
import {
    createDetalleEmpresa,
    getDetallesEmpresa,
    getDetalleEmpresaById,
    getDetalleEmpresaByEmpresaId,
    updateDetalleEmpresa,
    deleteDetalleEmpresa,
} from "../controllers/detalle-empresa.controller.js";

export const detalleEmpresaRouter = Router();

detalleEmpresaRouter.get("/", getDetallesEmpresa);
detalleEmpresaRouter.post("/", createDetalleEmpresa);
detalleEmpresaRouter.get("/:id", getDetalleEmpresaById);
detalleEmpresaRouter.get("/empresa/:empresa_id", getDetalleEmpresaByEmpresaId);
detalleEmpresaRouter.put("/:id", updateDetalleEmpresa);
detalleEmpresaRouter.delete("/:id", deleteDetalleEmpresa);