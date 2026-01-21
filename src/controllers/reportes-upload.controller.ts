import type { Request, Response } from "express";
import fetch from "node-fetch";
import { resolveSharepointPathReporte } from "../utils/sharepointPaths.js";

export async function uploadReporteDocx(req: Request, res: Response) {
    try {
        const { fileName, empresa, fileBase64 } = req.body as {
            fileName: string;
            empresa: string;
            fileBase64: string;
        };

        if (!fileName || !empresa || !fileBase64) {
            return res.status(400).json({
                ok: false,
                message: "fileName, empresa y fileBase64 son obligatorios",
            });
        }

        // 🔹 resolver ruta EXACTA (fuente de verdad)
        const sharepointPath = resolveSharepointPathReporte(empresa);

        if (!sharepointPath) {
            return res.status(400).json({
                ok: false,
                message: `No existe ruta SharePoint para ${empresa}`,
            });
        }

        // 🔹 validación tamaño (base64 → ~33% overhead)
        const sizeMb =
            Buffer.byteLength(fileBase64, "base64") / (1024 * 1024);

        if (sizeMb > 20) {
            return res.status(413).json({
                ok: false,
                message: "Archivo demasiado grande",
            });
        }

        // 🔹 enviar a Power Automate
        const response = await fetch(process.env.POWER_AUTOMATE_URL!, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                fileName,
                fileBase64,
                sharepointPath, // 👈 CLAVE
            }),
        });

        if (!response.ok) {
            const text = await response.text();
            throw new Error(`Power Automate failed: ${text}`);
        }

        return res.json({ ok: true });
    } catch (err) {
        console.error("❌ uploadReporteDocx error:", err);
        return res.status(500).json({
            ok: false,
            message: "Error enviando reporte a SharePoint",
        });
    }
}
