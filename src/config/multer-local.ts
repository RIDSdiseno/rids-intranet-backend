// Configuración de Multer para almacenamiento local de archivos (ej. firmas digitales, adjuntos, etc.)
import multer from "multer";
import path from "path";
import fs from "fs";
import { UPLOADS_DIR } from "../config/paths.js";

// Asegura que el directorio exista, si no lo crea
function ensureDir(dir: string) {
    fs.mkdirSync(dir, { recursive: true });
}

// Función para configurar Multer con almacenamiento local en una subcarpeta específica (ej. "firmas", "adjuntos", etc.)
export function localUpload(folder: string) {
    const storage = multer.diskStorage({
        destination(req, file, cb) {
            const dir = path.join(UPLOADS_DIR, folder);
            ensureDir(dir);
            cb(null, dir);
        },
        filename(req, file, cb) {
            const ext = path.extname(file.originalname);
            const name = `${Date.now()}-${Math.random()
                .toString(36)
                .slice(2)}${ext}`;
            cb(null, name);
        },
    });
    
    // Límite de 10MB por archivo (ajustable según necesidades)
    return multer({
        storage,
        limits: { fileSize: 10 * 1024 * 1024 },
    });
}
