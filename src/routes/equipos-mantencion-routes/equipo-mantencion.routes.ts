// src/routes/equipos-mantencion-routes/equipos-mantencion.routes.ts
import { Router } from "express";

import {
    listarMantencionesPorEquipo,
    listarTecnicosParaMantencion,
    registrarInstalacionMantGeneral,
    registrarMantencionEquipo,
    exportarMantencionesGenerales
} from "../../controllers/controllers-equipo-mantencion/equipo-mantencion.controller.js";

const router = Router();

router.get("/export", exportarMantencionesGenerales);
router.post("/mantencion", registrarMantencionEquipo);
router.post("/instalacion", registrarInstalacionMantGeneral);
router.get("/tecnicos/select", listarTecnicosParaMantencion);
router.get("/:id/mantenciones", listarMantencionesPorEquipo);

export default router;