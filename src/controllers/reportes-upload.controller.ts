import type { Request, Response } from "express";
import fetch from "node-fetch";
import { resolveSharepointPathReporte } from "../utils/sharepointPaths.js";

export async function uploadReporteDocx(req: Request, res: Response) {
    try {
        console.log("📥 uploadReporteDocx called");

        const { fileName, empresa, fileBase64 } = req.body as {
            fileName: string;
            empresa: string;
            fileBase64: string;
        };

        console.log("📄 fileName:", fileName);
        console.log("🏢 empresa:", empresa);
        console.log("📦 fileBase64 length:", fileBase64?.length);

        if (!fileName || !empresa || !fileBase64) {
            return res.status(400).json({
                ok: false,
                message: "fileName, empresa y fileBase64 son obligatorios",
            });
        }

        // 🔹 resolver ruta EXACTA (fuente de verdad)
        const sharepointPath = resolveSharepointPathReporte(empresa);
        console.log("📂 sharepointPath:", sharepointPath);

        if (!sharepointPath) {
            return res.status(400).json({
                ok: false,
                message: `No existe ruta SharePoint para ${empresa}`,
            });
        }

        // 🔹 validación tamaño
        const sizeMb =
            Buffer.byteLength(fileBase64, "base64") / (1024 * 1024);

        console.log("📏 Archivo size MB:", sizeMb.toFixed(2));

        if (sizeMb > 20) {
            return res.status(413).json({
                ok: false,
                message: "Archivo demasiado grande",
            });
        }

        console.log("🚀 Enviando a Power Automate...");
        console.log("🌐 POWER_AUTOMATE_URL:", process.env.POWER_AUTOMATE_URL);

        const response = await fetch(process.env.POWER_AUTOMATE_URL!, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                fileName,
                fileBase64,
                sharepointPath,
            }),
        });

        const responseText = await response.text();

        console.log("📨 Power Automate status:", response.status);
        console.log("📨 Power Automate response:", responseText);

        if (!response.ok) {
            throw new Error(
                `Power Automate failed (${response.status}): ${responseText}`
            );
        }

        console.log("✅ Reporte enviado correctamente a Power Automate");

        return res.json({ ok: true });
    } catch (err) {
        console.error("❌ uploadReporteDocx error:", err);
        return res.status(500).json({
            ok: false,
            message: "Error enviando reporte a SharePoint",
        });
    }
}
