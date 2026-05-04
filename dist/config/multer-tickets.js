import multer from "multer";
export const uploadTicketAttachments = multer({
    storage: multer.memoryStorage(),
    limits: {
        fileSize: 20 * 1024 * 1024,
    },
    fileFilter: (req, file, cb) => {
        const allowedTypes = [
            "image/jpeg",
            "image/png",
            "image/webp",
            "application/pdf",
            "application/msword",
            "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            "application/vnd.ms-excel",
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        ];
        if (!allowedTypes.includes(file.mimetype)) {
            return cb(new Error("Tipo de archivo no permitido"));
        }
        cb(null, true);
    },
});
//# sourceMappingURL=multer-tickets.js.map