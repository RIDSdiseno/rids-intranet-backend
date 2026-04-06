// Rutas para manejo de inventario, con endpoints para exportación (general y específica para SharePoint) y listado, delegando la lógica al controlador correspondiente
import { Router } from "express";
import { exportInventario, exportInventarioForSharepoint, getInventario } from "../controllers/inventario.controller.js";
const router = Router();
router.get("/export", exportInventario);
router.post("/export/sharepoint", exportInventarioForSharepoint);
router.get("/", getInventario);
export default router;
//# sourceMappingURL=inventario.routes.js.map