// src/routes/reportes-routes/reportes-upload.routes.ts
import { Router } from "express";
import {
    uploadReporteDocx,
    listHistorialReportes,
    uploadReporteSupabase,
    convertDocxToPdf,
    previewDocxToPdf,
    enviarInformeResumenCorreo,
    verReporteComoPdf
} from "../../controllers/controllers-reportes/reportes-upload.controller.js";

import { auth, onlyOwnEmpresa } from "../../middlewares/auth.js";

const router = Router();

router.post("/upload-docx", auth(), uploadReporteDocx);
router.get("/history", auth(), onlyOwnEmpresa(), listHistorialReportes);
router.post("/upload", auth(), uploadReporteSupabase);
router.post("/convert-pdf", auth(), convertDocxToPdf);
router.post("/enviar-informe-resumen", auth(), enviarInformeResumenCorreo);
router.post("/preview-docx-pdf", auth(), previewDocxToPdf);
router.get("/:id/pdf", auth(), onlyOwnEmpresa(), verReporteComoPdf);

export default router;