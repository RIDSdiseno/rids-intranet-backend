// src/routes/bitacora-tecnico.routes.ts
import { Router } from "express";

import {
    crearBitacoraTecnico,
    obtenerBitacorasTecnico,
    obtenerBitacoraTecnicoPorId,
    actualizarBitacoraTecnico,
    actualizarRecordatorioBitacora,
    eliminarBitacoraTecnico,
    obtenerOpcionesRelacionBitacora,
} from "../../controllers/controllers-bitacora-tecnico/bitacora-tecnico.controller.js";

import {
    agregarEvidenciaBitacora,
    obtenerEvidenciasBitacora,
    eliminarEvidenciaBitacora,
} from "../../controllers/controllers-bitacora-tecnico/bitacora-evidencias.controller.js";

import {
    actualizarEtapaBitacora,
    completarEtapaBitacora,
    obtenerEtapasBitacora,
    responderRevisionEtapa,
    solicitarRevisionEtapa,
} from "../../controllers/controllers-bitacora-tecnico/bitacora-etapas.controller.js";

import {
    uploadBitacoraEvidencia,
} from "../../middlewares/bitacora-evidencias-upload.middleware.js";

import { auth } from "../../middlewares/auth.js";

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
 * Evidencias multimedia de Bitácora.
 */
router.get("/:id/evidencias", auth(), obtenerEvidenciasBitacora);

router.post("/:id/evidencias", auth(), uploadBitacoraEvidencia.single("archivo"), agregarEvidenciaBitacora);

router.delete("/:id/evidencias/:evidenciaId", auth(), eliminarEvidenciaBitacora);

/* Etapas */

router.get("/:id/etapas", auth(), obtenerEtapasBitacora);

router.patch("/:id/etapas/:etapaId", auth(), actualizarEtapaBitacora);

router.post("/:id/etapas/:etapaId/completar", auth(), completarEtapaBitacora);

router.post("/:id/etapas/:etapaId/solicitar-revision", auth(), solicitarRevisionEtapa);

router.post("/:id/etapas/:etapaId/aprobaciones/:aprobacionId/responder", auth(), responderRevisionEtapa);

/*
 * Acciones por ID.
 */
router.get("/:id", auth(), obtenerBitacoraTecnicoPorId);

router.put("/:id", auth(), actualizarBitacoraTecnico);

router.delete("/:id", auth(), eliminarBitacoraTecnico);

export default router;