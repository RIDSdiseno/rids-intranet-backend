// Controlador para gestión de firmas digitales (subida, listado, etc.) en Ticketera RIDS
import type { Request, Response } from "express";
import fs from "fs";
import path from "path";
import { prisma } from "../../lib/prisma.js";

// Controlador para gestión de firmas digitales (subida, listado, etc.) en Ticketera RIDS
export async function subirFirma(req: Request, res: Response) {
    try {
        const tecnicoId = req.body.tecnicoId ? Number(req.body.tecnicoId) : null;
        const solicitanteId = req.body.solicitanteId
            ? Number(req.body.solicitanteId)
            : null;

        // 🔒 Validaciones
        if (!tecnicoId && !solicitanteId) {
            return res.status(400).json({
                error: "Debes enviar tecnicoId o solicitanteId",
            });
        }

        if (tecnicoId && solicitanteId) {
            return res.status(400).json({
                error: "Solo se permite tecnicoId o solicitanteId, no ambos",
            });
        }

        if (!req.file) {
            return res.status(400).json({ error: "Archivo no recibido" });
        }

        const newPath = `/uploads/firmas/${req.file.filename}`;

        // =====================
        // FIRMA DE TÉCNICO
        // =====================
        if (tecnicoId) {
            const firmaExistente = await prisma.firma.findUnique({
                where: { tecnicoId },
            });

            // 🧹 borrar archivo anterior si existe
            if (firmaExistente?.path) {
                const oldPath = path.resolve(
                    process.cwd(),
                    firmaExistente.path.slice(1)
                );
                if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath);
            }

            const firma = await prisma.firma.upsert({
                where: { tecnicoId },
                update: {
                    path: newPath,
                    mimeType: req.file.mimetype,
                    size: req.file.size,
                },
                create: {
                    tecnicoId,
                    path: newPath,
                    mimeType: req.file.mimetype,
                    size: req.file.size,
                },
            });

            return res.json(firma);
        }

        // =====================
        // FIRMA DE SOLICITANTE
        // =====================
        if (solicitanteId) {
            const firmaExistente = await prisma.firma.findUnique({
                where: { solicitanteId },
            });

            if (firmaExistente?.path) {
                const oldPath = path.resolve(
                    process.cwd(),
                    firmaExistente.path.slice(1)
                );
                if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath);
            }

            const firma = await prisma.firma.upsert({
                where: { solicitanteId },
                update: {
                    path: newPath,
                    mimeType: req.file.mimetype,
                    size: req.file.size,
                },
                create: {
                    solicitanteId,
                    path: newPath,
                    mimeType: req.file.mimetype,
                    size: req.file.size,
                },
            });

            return res.json(firma);
        }

    } catch (error) {
        console.error(error);
        return res.status(500).json({ error: "Error interno" });
    }
    return res.status(400).json({ error: "Solicitud inválida" });
}
