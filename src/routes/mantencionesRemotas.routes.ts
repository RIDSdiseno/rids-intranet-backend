import { Router } from "express";
import { auth } from "../middlewares/auth.js";

import {
  listMantencionesRemotas,
  getMantencionRemotaById,
  createMantencionRemota,
  updateMantencionRemota,
  deleteMantencionRemota,
  closeMantencionRemota,
  mantencionesRemotasMetrics,
  getMantencionesRemotasFilters,
} from "../controllers/mantencionesRemotas.controller.js";

const router = Router();

router.use(auth);

router.get("/", listMantencionesRemotas);
router.get("/filters", getMantencionesRemotasFilters);
router.get("/metrics", mantencionesRemotasMetrics);

router.get("/:id", getMantencionRemotaById);
router.post("/", createMantencionRemota);
router.put("/:id", updateMantencionRemota);
router.patch("/:id", updateMantencionRemota);
router.delete("/:id", deleteMantencionRemota);

router.post("/:id/close", closeMantencionRemota);

export default router;