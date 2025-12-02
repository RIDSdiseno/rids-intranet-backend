import { Router } from "express";
import { upload } from "../config/multer.js";
import { uploadImagen } from "../controllers/upload-imagenes.controller.js";

const router = Router();

router.post("/upload", upload.single("imagen"), uploadImagen);

export default router;
