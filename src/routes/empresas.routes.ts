// src/routes/empresas.routes.ts
import { Router } from "express";
import {
  getEmpresas,
  getEmpresaById,
  createEmpresa,
  updateEmpresa,
  deleteEmpresa,
  getEmpresasStats,
} from "../controllers/empresas.controller.js";

export const empresasRouter = Router();

empresasRouter.get("/", getEmpresas);
empresasRouter.get("/stats", getEmpresasStats);
empresasRouter.post("/", createEmpresa);
empresasRouter.get("/:id", getEmpresaById);
empresasRouter.put("/:id", updateEmpresa);
empresasRouter.delete("/:id", deleteEmpresa);

export default empresasRouter;
