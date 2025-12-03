import multer from "multer";
import { CloudinaryStorage } from "multer-storage-cloudinary";
import cloudinary from "./cloudinary.js";

const storage = new CloudinaryStorage({
    cloudinary,
    params: (req, file) => {
        const productoId = req.body?.productoId;

        return {
            folder: "rids",
            allowed_formats: ["jpg", "jpeg", "png", "webp"],

            // Si existe productoId → reemplaza la imagen
            // Si NO existe → genera public_id único
            public_id: productoId
                ? `producto_${productoId}`
                : `producto_${Date.now()}`,

            overwrite: true,
            invalidate: true,
        };
    },
});

export const upload = multer({ storage });
