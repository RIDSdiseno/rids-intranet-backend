import { Router, } from "express";
import { deleteDestinatarioCampania, getCampaniaProteccionDatos, getCampaniasProteccionDatos, getDestinatariosCampania, patchCampaniaProteccionDatos, postActivarCampaniaProteccionDatos, postCancelarCampaniaProteccionDatos, postCampaniaProteccionDatos, postDestinatariosCampania, postFinalizarCampaniaProteccionDatos, postEnviarCampaniaProteccionDatos, postRecordatorioCampaniaProteccionDatos, uploadDocumentoProteccionDatosController, getEventosConsentimiento, getResumenEmpresasProteccionDatos } from "../controllers/controllers-proteccion-datos/proteccion-datos.controller.js";
import { uploadDocumentoProteccionDatos, } from "../middlewares/proteccion-datos-documentos.middleware.js";
import { auth, } from "../middlewares/auth.js";
import { onlyRole, } from "../middlewares/roles.js";
const router = Router();
/*
 * routes.ts usa auth(false) global (sesión opcional).
 * Este router exige sesión y rol interno.
 * Las rutas públicas viven en proteccion-datos-publico.routes.ts.
 */
router.use(auth(), onlyRole("ADMIN", "ADMINISTRACION", "TECNICO"));
/* =========================================================
   RESUMEN POR EMPRESA
   ========================================================= */
router.get("/empresas-resumen", getResumenEmpresasProteccionDatos);
/* =========================================================
   CAMPAÑAS
   ========================================================= */
router.get("/campanias", getCampaniasProteccionDatos);
router.post("/campanias", postCampaniaProteccionDatos);
router.get("/campanias/:id", getCampaniaProteccionDatos);
router.patch("/campanias/:id", patchCampaniaProteccionDatos);
/* =========================================================
   DESTINATARIOS
   ========================================================= */
router.get("/campanias/:id/destinatarios", getDestinatariosCampania);
router.get("/campanias/:campaniaId/destinatarios/:consentimientoId/eventos", getEventosConsentimiento);
router.post("/campanias/:id/destinatarios", postDestinatariosCampania);
router.delete("/campanias/:id/destinatarios/:consentimientoId", deleteDestinatarioCampania);
router.post("/documentos", uploadDocumentoProteccionDatos.single("file"), uploadDocumentoProteccionDatosController);
/* =========================================================
   ESTADOS DE CAMPAÑA
   ========================================================= */
router.post("/campanias/:id/activar", postActivarCampaniaProteccionDatos);
router.post("/campanias/:id/enviar", postEnviarCampaniaProteccionDatos);
router.post("/campanias/:id/recordatorio", postRecordatorioCampaniaProteccionDatos);
router.post("/campanias/:id/finalizar", postFinalizarCampaniaProteccionDatos);
router.post("/campanias/:id/cancelar", postCancelarCampaniaProteccionDatos);
export default router;
//# sourceMappingURL=proteccion-datos.routes.js.map