// Rutas para manejo de análisis de inventario mediante IA, con endpoint para análisis por empresa, delegando la lógica al controlador correspondiente. Todas las rutas están protegidas por autenticación.
import { Router } from "express";
import { analizarInventarioEmpresa } from "../../controllers/ia-intranet-controller/ia-inventario.controller.js";
const iaInventarioRouter = Router();
// GET /api/ai/analisis-inventario/:empresaId
iaInventarioRouter.get("/:empresaId", analizarInventarioEmpresa);
export default iaInventarioRouter;
//# sourceMappingURL=ia-inventario.routes.js.map