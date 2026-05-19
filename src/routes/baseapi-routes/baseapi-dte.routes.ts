// src/routes/baseapi-dte.routes.ts
import { Router } from "express";
import { getDtePorFolioBaseApi, getDtePdfPorFolioBaseApi } from "../../controllers/baseapi/baseapi-dte.controller.js";

const router = Router();

router.get("/folio/:folio",getDtePorFolioBaseApi);
router.get("/folio/:folio/pdf", getDtePdfPorFolioBaseApi);

export default router;