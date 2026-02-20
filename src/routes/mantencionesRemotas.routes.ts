import { Router } from "express";
import { auth } from "../middlewares/auth.js";

import {
  listMantencionesRemotas,
  exportMantencionesRemotas, // ✅ NUEVO
  getMantencionRemotaById,
  createMantencionRemota,
  updateMantencionRemota,
  deleteMantencionRemota,
  closeMantencionRemota,
  mantencionesRemotasMetrics,
  getMantencionesRemotasFilters,
} from "../controllers/mantencionesRemotas.controller.js";

const router = Router();

router.use(auth()); // ✅ correcto

// ✅ Listado + filtros + métricas
router.get("/", listMantencionesRemotas);
router.get("/export", exportMantencionesRemotas); // ✅ NUEVO (antes de /:id)
router.get("/filters", getMantencionesRemotasFilters);
router.get("/metrics", mantencionesRemotasMetrics);

// ✅ CRUD
router.get("/:id", getMantencionRemotaById);
router.post("/", createMantencionRemota);
router.put("/:id", updateMantencionRemota);
router.patch("/:id", updateMantencionRemota);
router.delete("/:id", deleteMantencionRemota);

// ✅ Acción rápida
router.post("/:id/close", closeMantencionRemota);

// Debug
router.post("/__ping", (req, res) => {
  return res.json({ ok: true, bodyType: typeof req.body, body: req.body ?? null });
});

export default router;