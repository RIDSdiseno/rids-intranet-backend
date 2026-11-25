// src/routes/baseapi-dte.routes.ts
import { Router } from "express";
import { requireAuth } from "../../middlewares/auth.js";
import { getDtePorFolioBaseApi, getDtePdfPorFolioBaseApi } from "../../controllers/baseapi/baseapi-dte.controller.js";
const router = Router();
/* Antes público: detalle y PDF de cualquier factura por folio. El CLIENTE además
   solo accede a documentos de su RUT (validado en el controller). */
router.use(requireAuth);
router.get("/folio/:folio", getDtePorFolioBaseApi);
router.get("/folio/:folio/pdf", getDtePdfPorFolioBaseApi);
export default router;
//# sourceMappingURL=baseapi-dte.routes.js.map