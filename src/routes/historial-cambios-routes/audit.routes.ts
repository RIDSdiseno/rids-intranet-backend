import { Router } from "express";
import {
    listAuditLogs,
    listAuditByEmpresa,
    listEmpresasAuditLogs,
} from "../../controllers/historial-cambios-controller/audit.controller.js";
import { auth } from "../../middlewares/auth.js";

export const auditRouter = Router();

// Historial general de auditoría
auditRouter.get("/", auth(true), listAuditLogs);

// Historial general relacionado a empresas
auditRouter.get("/empresas", auth(true), listEmpresasAuditLogs);

// Historial filtrado por empresa específica
auditRouter.get("/empresa/:empresaId", auth(true), listAuditByEmpresa);

export default auditRouter;