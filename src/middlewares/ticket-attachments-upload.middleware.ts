// src/middlewares/ticket-attachments-upload.middleware.ts
import multer from "multer";
import type { Request, Response, NextFunction } from "express";

import {
    uploadTicketAttachments,
    MAX_TICKET_ATTACHMENT_SIZE_MB,
    MAX_TICKET_ATTACHMENTS,
} from "../config/multer-tickets.js";

export function handleTicketAttachmentsUpload(
    req: Request,
    res: Response,
    next: NextFunction
) {
    uploadTicketAttachments.array("attachments", MAX_TICKET_ATTACHMENTS)(
        req,
        res,
        (err: unknown) => {
            if (!err) {
                return next();
            }

            console.error("❌ Error procesando adjuntos del ticket:", err);

            if (err instanceof multer.MulterError) {
                if (err.code === "LIMIT_FILE_SIZE") {
                    return res.status(400).json({
                        ok: false,
                        message: `Uno o más archivos superan el máximo permitido de ${MAX_TICKET_ATTACHMENT_SIZE_MB} MB.`,
                    });
                }

                if (err.code === "LIMIT_FILE_COUNT") {
                    return res.status(400).json({
                        ok: false,
                        message: `Solo puedes adjuntar hasta ${MAX_TICKET_ATTACHMENTS} archivos por respuesta.`,
                    });
                }

                if (err.code === "LIMIT_UNEXPECTED_FILE") {
                    return res.status(400).json({
                        ok: false,
                        message:
                            "El campo de archivos adjuntos no es válido. El campo esperado es attachments.",
                    });
                }

                return res.status(400).json({
                    ok: false,
                    message: "Error al procesar los archivos adjuntos.",
                    detail: err.message,
                });
            }

            if (err instanceof Error) {
                return res.status(400).json({
                    ok: false,
                    message: err.message,
                });
            }

            return res.status(400).json({
                ok: false,
                message: "Archivo no permitido o inválido.",
            });
        }
    );
}