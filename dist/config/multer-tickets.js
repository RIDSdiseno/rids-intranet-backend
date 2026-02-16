import multer from "multer";
import { CloudinaryStorage } from "multer-storage-cloudinary";
import cloudinary from "./cloudinary.js";
const ticketStorage = new CloudinaryStorage({
    cloudinary,
    params: async (req, file) => {
        const ticketId = req.params.id;
        return {
            folder: `rids/helpdesk/tickets/${ticketId}`,
            resource_type: "auto", // 👈 PERMITE PDF, DOCX, ETC
            public_id: `ticket_${ticketId}_${Date.now()}`,
        };
    },
});
export const uploadTicketAttachments = multer({
    storage: ticketStorage,
    limits: {
        fileSize: 20 * 1024 * 1024, // 20MB
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
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        ];
        if (!allowedTypes.includes(file.mimetype)) {
            return cb(new Error("Tipo de archivo no permitido"));
        }
        cb(null, true);
    },
});
//# sourceMappingURL=multer-tickets.js.map