// src/routes/baseapi-dte.routes.ts
import { Router } from "express";
import { getDtePorFolioBaseApi } from "../../controllers/baseapi/baseapi-dte.controller.js";
const router = Router();
router.get("/folio/:folio", getDtePorFolioBaseApi);
export default router;
//# sourceMappingURL=baseapi-dte.routes.js.map