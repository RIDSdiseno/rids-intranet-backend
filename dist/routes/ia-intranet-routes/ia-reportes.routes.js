// Rutas para manejo de reportes operativos mediante IA, con endpoint para generación de informe operativo por empresa, año y mes, delegando la lógica al controlador correspondiente. Todas las rutas están protegidas por autenticación.
import { Router } from "express";
import { generarInformeOperativoIA } from "../../controllers/ia-intranet-controller/ia-reportes.controller.js";
const iaReportesRouter = Router();
/**
 * =====================================================
 * IA REPORTES
 * =====================================================
 */
/**
 * Generar informe operativo con IA
 * Usa cache si ya existe
 */
iaReportesRouter.get("/informe-operativo/:empresaId/:year/:month", generarInformeOperativoIA);
export default iaReportesRouter;
//# sourceMappingURL=ia-reportes.routes.js.map