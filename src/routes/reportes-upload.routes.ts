import { Router } from "express";
import { uploadReporteDocx } from "../controllers/reportes-upload.controller.js";

const router = Router();

router.post("/upload-docx", uploadReporteDocx);

export default router;
