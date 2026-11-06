// src/routes/routes-leypd/leypd.routes.ts
import { Router, } from "express";
import { auth, } from "../../middlewares/auth.js";
import { onlyRole, } from "../../middlewares/roles.js";
import { listarLeypd, obtenerEmpresaLeypd, actualizarElementoLeypdController, } from "../../controllers/controllers-leypd/leypd.controller.js";
import { getFichaLeypdInterna, putFichaLeypdInterna, postEnlaceFichaLeypd, postRevocarEnlaceFichaLeypd, getMiFichaLeypd, putMiFichaLeypd, } from "../../controllers/controllers-leypd/leypd-ficha.controller.js";
import { postActualizacionLeypd, getActualizacionLeypd, getActualizacionActivaLeypd, getUltimaActualizacionLeypd, postCancelarActualizacionLeypd, } from "../../controllers/controllers-leypd/leypd-actualizacion.controller.js";
import { getConsentimientosElementoLeypd, } from "../../controllers/controllers-leypd/leypd-consentimientos.controller.js";
import { getSharepointLeypd, postSincronizarSharepointLeypd, postSincronizarTodasSharepointLeypd, postVincularSharepointLeypd, } from "../../controllers/controllers-leypd/leypd-sharepoint.controller.js";
const router = Router();
/* =====================================================
   PORTAL CLIENTE
   IMPORTANTE: antes de /:empresaId
===================================================== */
router.get("/mi-empresa/ficha", auth(), onlyRole("CLIENTE"), getMiFichaLeypd);
router.put("/mi-empresa/ficha", auth(), onlyRole("CLIENTE"), putMiFichaLeypd);
/* =====================================================
   ACTUALIZACIONES
   IMPORTANTE: antes de /:empresaId
===================================================== */
router.get("/actualizaciones/activa", auth(), onlyRole("ADMIN", "ADMINISTRACION"), getActualizacionActivaLeypd);
router.get("/actualizaciones/ultima", auth(), onlyRole("ADMIN", "ADMINISTRACION"), getUltimaActualizacionLeypd);
router.post("/actualizaciones/:id/cancelar", auth(), onlyRole("ADMIN", "ADMINISTRACION"), postCancelarActualizacionLeypd);
router.post("/sharepoint/sincronizar-todas", auth(), onlyRole("ADMIN", "ADMINISTRACION"), postSincronizarTodasSharepointLeypd);
router.get("/actualizaciones/:id", auth(), onlyRole("ADMIN", "ADMINISTRACION"), getActualizacionLeypd);
router.post("/actualizaciones", auth(), onlyRole("ADMIN", "ADMINISTRACION"), postActualizacionLeypd);
/* =====================================================
   DASHBOARD INTERNO
===================================================== */
router.get("/", auth(), onlyRole("ADMIN", "ADMINISTRACION", "TECNICO"), listarLeypd);
/* =====================================================
   FICHA INTERNA
===================================================== */
router.get("/:empresaId/ficha", auth(), onlyRole("ADMIN", "ADMINISTRACION", "TECNICO"), getFichaLeypdInterna);
router.put("/:empresaId/ficha", auth(), onlyRole("ADMIN", "ADMINISTRACION", "TECNICO"), putFichaLeypdInterna);
router.post("/:empresaId/ficha/enlace", auth(), onlyRole("ADMIN", "ADMINISTRACION"), postEnlaceFichaLeypd);
router.post("/:empresaId/ficha/revocar", auth(), onlyRole("ADMIN", "ADMINISTRACION"), postRevocarEnlaceFichaLeypd);
/* =====================================================
   ELEMENTOS
===================================================== */
router.get("/:empresaId/elementos/4/consentimientos", auth(), onlyRole("ADMIN", "ADMINISTRACION", "TECNICO"), getConsentimientosElementoLeypd);
router.put("/:empresaId/elementos/:numero", auth(), onlyRole("ADMIN", "ADMINISTRACION", "TECNICO"), actualizarElementoLeypdController);
/* =====================================================
   SHAREPOINT
===================================================== */
router.get("/:empresaId/sharepoint", auth(), onlyRole("ADMIN", "ADMINISTRACION", "TECNICO"), getSharepointLeypd);
router.post("/:empresaId/sharepoint/vincular", auth(), onlyRole("ADMIN", "ADMINISTRACION"), postVincularSharepointLeypd);
router.post("/:empresaId/sharepoint/sincronizar", auth(), onlyRole("ADMIN", "ADMINISTRACION", "TECNICO"), postSincronizarSharepointLeypd);
/* =====================================================
   DETALLE EMPRESA
   SIEMPRE AL FINAL
===================================================== */
router.get("/:empresaId", auth(), onlyRole("ADMIN", "ADMINISTRACION", "TECNICO"), obtenerEmpresaLeypd);
export default router;
//# sourceMappingURL=leypd.routes.js.map