// src/routes/baseapi-routes/cobranza/cobranza-receptores.routes.ts
import { Router, } from "express";
import { deleteContactoCobranza, deleteReceptorCobranza, getReceptorCobranza, getReceptorCobranzaPorRut, getReceptoresCobranza, patchContactoCobranza, patchReceptorCobranza, postContactoCobranza, postCopiarContactosFacturacion, postReceptorCobranza, } from "../../../controllers/baseapi/cobranza/cobranza-receptores.controller.js";
import { postSincronizarReceptoresCobranzaCrm, } from "../../../controllers/baseapi/receptores-sync-crm.controller.js";
import { auth, } from "../../../middlewares/auth.js";
import { onlyRole, } from "../../../middlewares/roles.js";
const router = Router();
router.use(auth());
router.use(onlyRole("ADMINISTRACION", "VENTAS"));
/*
 * IMPORTANTE:
 * /rut/:rut debe ir ANTES de /:id.
 */
router.get("/rut/:rut", getReceptorCobranzaPorRut);
router.get("/", getReceptoresCobranza);
router.post("/", postReceptorCobranza);
/* Sincronizar empresas y contactos del CRM: ?aplicar=1 aplica; sin él, simula. Antes de /:id */
router.post("/sincronizar-crm", postSincronizarReceptoresCobranzaCrm);
router.get("/:id", getReceptorCobranza);
router.patch("/:id", patchReceptorCobranza);
router.delete("/:id", deleteReceptorCobranza);
router.post("/:id/contactos", postContactoCobranza);
router.patch("/:id/contactos/:contactoId", patchContactoCobranza);
router.delete("/:id/contactos/:contactoId", deleteContactoCobranza);
router.post("/:id/copiar-contactos-facturacion", postCopiarContactosFacturacion);
export default router;
//# sourceMappingURL=cobranza-receptores.routes.js.map