import { Router } from "express";
import { getReporteEmpresa } from "../controllers/reportes.controller.js";
const router = Router();
router.get("/empresa/:empresaId", getReporteEmpresa);
export default router;
//# sourceMappingURL=reportes.routes.js.map