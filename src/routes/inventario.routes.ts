import { Router } from "express";
import { exportInventario } from "../controllers/inventario.controller.js";

const router = Router();

router.get("/export", exportInventario);

export default router;
