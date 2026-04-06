// Rutas para manejo de historial de cambios, con endpoints para listado de logs de auditoría y filtrado por empresa, delegando la lógica al controlador correspondiente. Todas las rutas están protegidas por autenticación.
import { Router } from "express";
import { listAuditLogs, listAuditByEmpresa } from "../../controllers/historial-cambios-controller/audit.controller.js";
import { auth } from "../../middlewares/auth.js";
export const auditRouter = Router();
// Solo usuarios autenticados
auditRouter.get("/", auth(true), listAuditLogs);
auditRouter.get("/empresa/:empresaId", auth(true), listAuditByEmpresa);
export default auditRouter;
//# sourceMappingURL=audit.routes.js.map