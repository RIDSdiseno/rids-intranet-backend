// src/config/multer-tickets.ts
import multer from "multer";

export const MAX_TICKET_ATTACHMENT_SIZE_MB = 50;
export const MAX_TICKET_ATTACHMENT_SIZE_BYTES =
    MAX_TICKET_ATTACHMENT_SIZE_MB * 1024 * 1024;

export const MAX_TICKET_ATTACHMENTS = 10;

const allowedTypes = [
    // Imágenes
    "image/jpeg",
    "image/png",
    "image/webp",
    "image/gif",

    // PDF
    "application/pdf",

    // Word
    "application/msword",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",

    // Excel
    "application/vnd.ms-excel",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "application/vnd.ms-excel.sheet.macroEnabled.12",

    // Texto
    "text/plain",

    // ZIP
    "application/zip",
    "application/x-zip-compressed",

    // MP4
    "video/mp4",
];

export const uploadTicketAttachments = multer({
    storage: multer.memoryStorage(),
    limits: {
        fileSize: MAX_TICKET_ATTACHMENT_SIZE_BYTES,
        files: MAX_TICKET_ATTACHMENTS,
    },
    fileFilter: (_req, file, cb) => {
        if (!allowedTypes.includes(file.mimetype)) {
            return cb(
                new Error(`Tipo de archivo no permitido: ${file.originalname}`)
            );
        }

        cb(null, true);
    },
});