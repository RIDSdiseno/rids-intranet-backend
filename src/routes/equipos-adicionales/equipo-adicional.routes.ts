// src/routes/equipos-adicionales/equipo-adicional.routes.ts

import { Router } from "express";
import { requireAuth } from "../../middlewares/auth.js";

import {
  listEquipoAdicionales,
  listAdicionalesByEquipo,
  getEquipoAdicional,
  createEquipoAdicional,
  updateEquipoAdicional,
  deleteEquipoAdicional,
  exportEquipoAdicionales,
} from "../../controllers/controllers-equipos-adicionales/equipo-adicional.controller.js";

const router = Router();

/* Exige sesión: sin token, el controller trataba la petición como interna
   (buildEquipoVisibleWhere sin usuario = sin filtro de empresa). */
router.use(requireAuth);

router.get(
  "/",
  listEquipoAdicionales
);

router.get(
  "/equipo/:equipoId",
  listAdicionalesByEquipo
);

router.get(
  "/export",
  exportEquipoAdicionales
);

router.get(
  "/:id",
  getEquipoAdicional
);

router.post(
  "/",
  createEquipoAdicional
);

router.patch(
  "/:id",
  updateEquipoAdicional
);

router.delete(
  "/:id",
  deleteEquipoAdicional
);

export default router;