import multer from "multer";

const MAX_FILE_SIZE =
    10 * 1024 * 1024;

const ALLOWED_MIME_TYPES =
    new Set([
        "text/html",
        "image/png",
        "image/jpeg",
        "image/webp",
    ]);

export const uploadPlantillaCorreo =
    multer({
        storage:
            multer.memoryStorage(),

        limits: {
            fileSize:
                MAX_FILE_SIZE,
        },

        fileFilter: (
            _req,
            file,
            callback
        ) => {

            const extension =
                file.originalname
                    .toLowerCase()
                    .split(".")
                    .pop();

            const isHtmlExtension =
                extension === "html" ||
                extension === "htm";

            const allowed =
                ALLOWED_MIME_TYPES.has(
                    file.mimetype
                ) ||
                isHtmlExtension;

            if (!allowed) {
                return callback(
                    new Error(
                        "Solo se permiten archivos HTML, PNG, JPG, JPEG y WEBP"
                    )
                );
            }

            callback(
                null,
                true
            );
        },
    });