// Rutas para manejo de uploads de reportes en formato DOCX, utilizando Multer para procesar los archivos subidos y delegando la lógica al controlador correspondiente
import { Router } from "express";
import { uploadReporteDocx } from "../controllers/reportes-upload.controller.js";

const router = Router();

router.post("/upload-docx", uploadReporteDocx);

export default router;
