import { Router } from "express";
import { exportInventario, exportInventarioForSharepoint } from "../controllers/inventario.controller.js";
const router = Router();
router.get("/export", exportInventario);
router.post("/export/sharepoint", exportInventarioForSharepoint);
export default router;
//# sourceMappingURL=inventario.routes.js.map