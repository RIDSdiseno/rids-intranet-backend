// src/routes/equipos-adicionales/equipo-adicional.routes.ts

import { Router } from "express";

import {
    listEquipoAdicionales,
    listAdicionalesByEquipo,
    getEquipoAdicional,
    createEquipoAdicional,
    updateEquipoAdicional,
    deleteEquipoAdicional,
    exportEquipoAdicionales,
} from "../../controllers/equipos-adicionales/equipo-adicional.controller.js";

const router = Router();

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