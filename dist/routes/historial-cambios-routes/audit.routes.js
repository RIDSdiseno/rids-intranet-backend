import { Router } from "express";
import { listAuditLogs, listAuditByEmpresa } from "../../controllers/historial-cambios-controller/audit.controller.js";
import { auth } from "../../middlewares/auth.js";
export const auditRouter = Router();
// Solo usuarios autenticados
auditRouter.get("/", auth(true), listAuditLogs);
auditRouter.get("/empresa/:empresaId", auth(true), listAuditByEmpresa);
export default auditRouter;
//# sourceMappingURL=audit.routes.js.map