// src/routes/bitacora-tecnico.routes.ts
import { Router } from "express";
import { crearBitacoraTecnico, obtenerBitacorasTecnico, obtenerBitacoraTecnicoPorId, actualizarBitacoraTecnico, actualizarRecordatorioBitacora, eliminarBitacoraTecnico, obtenerOpcionesRelacionBitacora, } from "../controllers/bitacora-tecnico.controller.js";
import { auth } from "../middlewares/auth.js";
const router = Router();
/*
 * Opciones para relaciones.
 * Debe ir antes de las rutas con /:id.
 */
router.get("/opciones-relacion", auth(), obtenerOpcionesRelacionBitacora);
/*
 * Listar y crear bitácoras.
 */
router.get("/", auth(), obtenerBitacorasTecnico);
router.post("/", auth(), crearBitacoraTecnico);
/*
 * Completar o reactivar un recordatorio.
 */
router.patch("/:id/recordatorio", auth(), actualizarRecordatorioBitacora);
/*
 * Acciones por ID.
 */
router.get("/:id", auth(), obtenerBitacoraTecnicoPorId);
router.put("/:id", auth(), actualizarBitacoraTecnico);
router.delete("/:id", auth(), eliminarBitacoraTecnico);
export default router;
//# sourceMappingURL=bitacora-tecnico.routes.js.map