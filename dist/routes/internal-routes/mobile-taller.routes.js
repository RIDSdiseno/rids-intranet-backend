import { Router, } from "express";
import { crearIngresoTallerMobile, } from "../../controllers/controllers-internals/mobile-taller.controller.js";
const router = Router();
router.post("/ingresos", crearIngresoTallerMobile);
export default router;
//# sourceMappingURL=mobile-taller.routes.js.map