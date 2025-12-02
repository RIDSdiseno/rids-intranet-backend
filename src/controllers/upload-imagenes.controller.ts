import type { Request, Response } from "express";

export async function uploadImagen(req: Request, res: Response) {
    try {
        const file = req.file;

        if (!file) {
            return res.status(400).json({ error: "No se envió imagen" });
        }

        return res.json({
            url: file.path,
            public_id: file.filename,
        });

    } catch (error) {
        console.error("❌ Error al subir imagen:", error);
        return res.status(500).json({ error: "Error al subir imagen" });
    }
}
