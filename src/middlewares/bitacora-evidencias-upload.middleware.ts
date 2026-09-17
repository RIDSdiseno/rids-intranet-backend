import multer from "multer";

const MIME_PERMITIDOS = [
    "image/jpeg",
    "image/png",
    "image/webp",
    "video/mp4",
    "video/webm",
    "video/quicktime",
];

export const uploadBitacoraEvidencia = multer({
    storage: multer.memoryStorage(),

    limits: {
        fileSize:
            150 * 1024 * 1024,
    },

    fileFilter: (
        req,
        file,
        callback
    ) => {
        if (
            !MIME_PERMITIDOS.includes(
                file.mimetype
            )
        ) {
            return callback(
                new Error(
                    "Solo se permiten imágenes y videos"
                )
            );
        }

        callback(null, true);
    },
});