import { Router } from "express";
import { exportInventario, exportInventarioForSharepoint, getInventario } from "../controllers/inventario.controller.js";

const router = Router();

router.get("/export", exportInventario);

router.post("/export/sharepoint", exportInventarioForSharepoint);

router.get("/", getInventario);

export default router;
