import { Router } from "express";
import { analizarInventarioEmpresa } from "../../controllers/ia-intranet-controller/ia-inventario.controller.js";
const iaInventarioRouter = Router();
// GET /api/ai/analisis-inventario/:empresaId
iaInventarioRouter.get("/analisis-inventario/:empresaId", analizarInventarioEmpresa);
export default iaInventarioRouter;
//# sourceMappingURL=ia-inventario.routes.js.map