// src/routes/equipos-mantencion-routes/equipos-mantencion.routes.ts
import { Router } from "express";
import { auth } from "../../middlewares/auth.js";
import { empresaIdDeEquipo, validarRecursoEnRuta } from "../../middlewares/recurso-empresa-cliente.js";
import { listarMantencionesPorEquipo, listarTecnicosParaMantencion, registrarInstalacionMantGeneral, registrarMantencionEquipo, exportarMantencionesGenerales } from "../../controllers/controllers-equipo-mantencion/equipo-mantencion.controller.js";
const router = Router();
router.get("/export", auth(), exportarMantencionesGenerales);
router.post("/mantencion", registrarMantencionEquipo);
router.post("/instalacion", registrarInstalacionMantGeneral);
router.get("/tecnicos/select", listarTecnicosParaMantencion);
/* CRM (JWT). CLIENTE: solo equipos de su empresa */
router.get("/:id/mantenciones", auth(), validarRecursoEnRuta("id", empresaIdDeEquipo), listarMantencionesPorEquipo);
export default router;
//# sourceMappingURL=equipo-mantencion.routes.js.map