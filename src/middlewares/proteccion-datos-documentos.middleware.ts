import multer from "multer";

const MAX_PDF_SIZE =
    15 *
    1024 *
    1024;

export const uploadDocumentoProteccionDatos =
    multer({
        storage:
            multer.memoryStorage(),

        limits: {
            fileSize:
                MAX_PDF_SIZE,
        },

        fileFilter: (
            _req,
            file,
            callback,
        ) => {

            if (
                file.mimetype !==
                "application/pdf"
            ) {
                callback(
                    new Error(
                        "Solo se permiten documentos PDF",
                    ),
                );

                return;
            }

            callback(
                null,
                true,
            );
        },
    });