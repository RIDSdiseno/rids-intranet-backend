import { Router } from "express";
import { getReporteEmpresa } from "../../controllers/controllers-reportes/reportes.controller.js";
const router = Router();
// Web / Dashboard
router.get("/empresa/:empresaId", getReporteEmpresa);
export default router;
//# sourceMappingURL=reportes.routes.js.map