import { Router } from "express";
import { uploadReporteDocx, listHistorialReportes, uploadReporteSupabase, convertDocxToPdf } from "../controllers/reportes-upload.controller.js";
import { auth } from "../middlewares/auth.js";
import { onlyOwnEmpresa } from "../middlewares/auth.js";
const router = Router();
router.post("/upload-docx", auth(), uploadReporteDocx);
router.get("/history", auth(), onlyOwnEmpresa(), listHistorialReportes);
router.post("/upload", auth(), uploadReporteSupabase);
router.post("/convert-pdf", auth(), convertDocxToPdf);
export default router;
//# sourceMappingURL=reportes-upload.routes.js.map