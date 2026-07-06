// src/routes/equipos-mantencion-routes/equipos-mantencion.routes.ts
import { listarMantencionesPorEquipo, registrarMantencionEquipo } from "../../controllers/controllers-equipo-mantencion/equipo-mantencion.controller.js";
import { Router } from "express";
const router = Router();
router.post("/mantencion", registrarMantencionEquipo);
router.get("/:id/mantenciones", listarMantencionesPorEquipo);
export default router;
//# sourceMappingURL=equipo-mantencion.routes.js.map