// src/routes/equipos-mantencion-routes/equipos-mantencion.routes.ts
import { Router } from "express";
import { listarMantencionesPorEquipo, listarTecnicosParaMantencion, registrarInstalacionMantGeneral, registrarMantencionEquipo, } from "../../controllers/controllers-equipo-mantencion/equipo-mantencion.controller.js";
const router = Router();
router.post("/mantencion", registrarMantencionEquipo);
router.post("/instalacion", registrarInstalacionMantGeneral);
router.get("/tecnicos/select", listarTecnicosParaMantencion);
router.get("/:id/mantenciones", listarMantencionesPorEquipo);
export default router;
//# sourceMappingURL=equipo-mantencion.routes.js.map