// Rutas para manejo de mantenciones remotas, con endpoints para listado (con filtros y métricas), CRUD completo, acción rápida de cierre, y exportación a Excel, delegando la lógica al controlador correspondiente
import { Router } from "express";
import { auth } from "../middlewares/auth.js";

import {
  listMantencionesRemotas,
  exportMantencionesRemotas, 
  getMantencionRemotaById,
  createMantencionRemota,
  updateMantencionRemota,
  deleteMantencionRemota,
  closeMantencionRemota,
  mantencionesRemotasMetrics,
  getMantencionesRemotasFilters,
} from "../controllers/mantencionesRemotas.controller.js";

const router = Router();

router.use(auth()); 

// Listado + filtros + métricas
router.get("/", listMantencionesRemotas);
router.get("/export", exportMantencionesRemotas); 
router.get("/filters", getMantencionesRemotasFilters);
router.get("/metrics", mantencionesRemotasMetrics);

// CRUD
router.get("/:id", getMantencionRemotaById);
router.post("/", createMantencionRemota);
router.put("/:id", updateMantencionRemota);
router.patch("/:id", updateMantencionRemota);
router.delete("/:id", deleteMantencionRemota);

// Acción rápida
router.post("/:id/close", closeMantencionRemota);

// Debug
router.post("/__ping", (req, res) => {
  return res.json({ ok: true, bodyType: typeof req.body, body: req.body ?? null });
});

export default router;