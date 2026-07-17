import { Router } from "express";
import {
    listAuditLogs,
    listAuditByEmpresa,
    createAuditLog,
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
// Permite crear manualmente un registro de auditoría (ej. cuando se envía un recordatorio)
auditRouter.post("/", auth(true), createAuditLog);

export default auditRouter;