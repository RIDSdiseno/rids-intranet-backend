import { Router, } from "express";
import { getConsentimientoPublico, postResponderConsentimientoPublico, postRevocarConsentimientoPublico, } from "../controllers/controllers-proteccion-datos/proteccion-datos-publico.controller.js";
const router = Router();
/* =========================================================
   PROTECCIÓN DE DATOS — PÚBLICO
   ========================================================= */
/**
 * Obtener información asociada al token.
 *
 * NO requiere JWT.
 */
router.get("/:token", getConsentimientoPublico);
/**
 * Registrar respuesta.
 *
 * NO requiere JWT.
 */
router.post("/:token/responder", postResponderConsentimientoPublico);
/**
 * Revocar consentimiento previamente aceptado.
 *
 * NO requiere JWT.
 */
router.post("/:token/revocar", postRevocarConsentimientoPublico);
export default router;
//# sourceMappingURL=proteccion-datos-publico.routes.js.map