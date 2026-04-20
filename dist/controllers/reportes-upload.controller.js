import fetch from "node-fetch";
import { resolveSharepointPathReporte } from "../utils/sharepointPaths.js";
import { prisma } from "../lib/prisma.js";
import { supabaseAdmin } from "../lib/supabase/supabase.js";
import { exec } from "child_process";
import { writeFileSync, readFileSync, existsSync, unlinkSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { promisify } from "util";
// ─── DOCX → SharePoint + Supabase ────────────────────────────────────────
export async function uploadReporteDocx(req, res) {
    try {
        const { fileName, empresaId, empresa, periodo, tipo, fileBase64 } = req.body;
        if (!fileName || !empresa || !fileBase64) {
            return res.status(400).json({ ok: false, message: "fileName, empresa y fileBase64 son obligatorios" });
        }
        const sharepointPath = resolveSharepointPathReporte(empresa);
        if (!sharepointPath) {
            return res.status(400).json({ ok: false, message: `No existe ruta SharePoint para ${empresa}` });
        }
        const sizeMb = Buffer.byteLength(fileBase64, "base64") / (1024 * 1024);
        if (sizeMb > 20) {
            return res.status(413).json({ ok: false, message: "Archivo demasiado grande" });
        }
        // 1. Enviar a Power Automate
        const response = await fetch(process.env.POWER_AUTOMATE_URL, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ fileName, fileBase64, sharepointPath }),
        });
        const responseText = await response.text();
        if (!response.ok) {
            throw new Error(`Power Automate failed (${response.status}): ${responseText}`);
        }
        if (response.status === 202 || !responseText) {
            throw new Error("Power Automate no devolvió URL. El flujo debe responder con status 200 y urlArchivo.");
        }
        // 2. Parsear respuesta UNA sola vez
        let powerAutomateJson = null;
        try {
            powerAutomateJson = JSON.parse(responseText);
        }
        catch {
            throw new Error("Power Automate no devolvió un JSON válido.");
        }
        const sharepointUrl = powerAutomateJson?.urlArchivo ||
            powerAutomateJson?.webUrl ||
            powerAutomateJson?.url ||
            null;
        if (!sharepointUrl) {
            throw new Error("Power Automate no devolvió una URL de archivo.");
        }
        // 3. Subir también a Supabase (no crítico)
        let supabaseUrl = null;
        let supabaseStoragePath = null;
        try {
            const bucket = process.env.SUPABASE_BUCKET_REPORTES || "reportes";
            const bufferDocx = Buffer.from(fileBase64, "base64");
            const safeEmpresa = empresa.replace(/\s+/g, "_").replace(/[^\w-]/g, "");
            const safePeriodo = (periodo || "Periodo").replace(/\s+/g, "_").replace(/[^\w-]/g, "");
            supabaseStoragePath = `${safeEmpresa}/${safePeriodo}/${fileName}`;
            await supabaseAdmin.storage.from(bucket).upload(supabaseStoragePath, bufferDocx, {
                contentType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
                upsert: true,
            });
            const { data: publicData } = supabaseAdmin.storage
                .from(bucket)
                .getPublicUrl(supabaseStoragePath);
            supabaseUrl = publicData?.publicUrl ?? null;
        }
        catch (err) {
            console.error("⚠️ Supabase upload (non-critical):", err);
        }
        // 4. Guardar en BD — Supabase URL tiene prioridad para acceso externo
        await prisma.reporteGenerado.create({
            data: {
                empresaId: empresaId ? Number(empresaId) : null,
                empresaNombre: empresa,
                periodo: periodo || "Periodo",
                tipo: tipo || "DOCX",
                nombreArchivo: fileName,
                urlArchivo: supabaseUrl ?? sharepointUrl,
                sharepointPath: sharepointPath,
                storagePath: supabaseStoragePath,
                generadoPorId: req.user?.id ?? null,
                generadoPor: req.user?.nombre ?? req.user?.email ?? null,
                estado: "GENERADO",
            },
        });
        return res.json({ ok: true, urlArchivo: supabaseUrl ?? sharepointUrl });
    }
    catch (err) {
        console.error("❌ uploadReporteDocx error:", err);
        return res.status(500).json({ ok: false, message: "Error enviando reporte a SharePoint" });
    }
}
// ─── Historial ────────────────────────────────────────────────────────────
export async function listHistorialReportes(req, res) {
    try {
        const user = req.user;
        const esCliente = user?.rol === "CLIENTE";
        const empresaId = typeof req.query.empresaId === "string" && req.query.empresaId
            ? Number(req.query.empresaId)
            : undefined;
        const items = await prisma.reporteGenerado.findMany({
            where: { ...(empresaId ? { empresaId } : {}) },
            orderBy: { createdAt: "desc" },
            take: 200,
        });
        const itemsFiltrados = items.map((item) => {
            if (esCliente) {
                return {
                    ...item,
                    urlArchivo: item.storagePath ? item.urlArchivo : null,
                    sharepointPath: undefined,
                };
            }
            return item;
        });
        return res.json({ ok: true, items: itemsFiltrados });
    }
    catch (error) {
        console.error("❌ listHistorialReportes error:", error);
        return res.status(500).json({ ok: false, message: "Error obteniendo historial" });
    }
}
// ─── PDF → solo Supabase ──────────────────────────────────────────────────
export async function uploadReporteSupabase(req, res) {
    try {
        const { fileName, empresaId, empresa, periodo, tipo, fileBase64 } = req.body;
        if (!fileName || !empresa || !fileBase64) {
            return res.status(400).json({ ok: false, message: "fileName, empresa y fileBase64 son obligatorios" });
        }
        const bucket = process.env.SUPABASE_BUCKET_REPORTES || "reportes";
        const buffer = Buffer.from(fileBase64, "base64");
        const safeEmpresa = empresa.replace(/\s+/g, "_").replace(/[^\w-]/g, "");
        const safePeriodo = (periodo || "Periodo").replace(/\s+/g, "_").replace(/[^\w-]/g, "");
        const storagePath = `${safeEmpresa}/${safePeriodo}/${fileName}`;
        const contentType = fileName.endsWith(".docx")
            ? "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
            : "application/pdf";
        const { error: uploadError } = await supabaseAdmin.storage
            .from(bucket)
            .upload(storagePath, buffer, { contentType, upsert: true });
        if (uploadError)
            throw uploadError;
        const { data: publicData } = supabaseAdmin.storage
            .from(bucket)
            .getPublicUrl(storagePath);
        const urlArchivo = publicData?.publicUrl ?? null;
        await prisma.reporteGenerado.create({
            data: {
                empresaId: empresaId ? Number(empresaId) : null,
                empresaNombre: empresa,
                periodo: periodo || "Periodo",
                tipo: tipo || "PDF",
                nombreArchivo: fileName,
                urlArchivo,
                storagePath,
                generadoPorId: req.user?.id ?? null,
                generadoPor: req.user?.nombre ?? req.user?.email ?? null,
                estado: "GENERADO",
            },
        });
        return res.json({ ok: true, urlArchivo, storagePath });
    }
    catch (error) {
        console.error("uploadReporteSupabase error:", error);
        return res.status(500).json({ ok: false, message: "Error subiendo reporte a Supabase" });
    }
}
// ─── DOCX → PDF via LibreOffice → Supabase ───────────────────────────────
const execAsync = promisify(exec);
export async function convertDocxToPdf(req, res) {
    try {
        const { fileBase64, fileName, empresaId, empresa, periodo } = req.body;
        if (!fileBase64 || !fileName) {
            return res.status(400).json({ ok: false, message: "fileBase64 y fileName son obligatorios" });
        }
        const tmpDocx = join(tmpdir(), `${Date.now()}_reporte.docx`);
        const buffer = Buffer.from(fileBase64, "base64");
        writeFileSync(tmpDocx, buffer);
        try {
            await execAsync(`libreoffice --headless --convert-to pdf "${tmpDocx}" --outdir "${tmpdir()}"`, {
                timeout: 60000,
            });
        }
        catch (err) {
            unlinkSync(tmpDocx);
            return res.status(500).json({ ok: false, message: "Error convirtiendo DOCX a PDF. ¿LibreOffice instalado?" });
        }
        const pdfPath = tmpDocx.replace(".docx", ".pdf");
        if (!existsSync(pdfPath)) {
            unlinkSync(tmpDocx);
            return res.status(500).json({ ok: false, message: "No se generó el PDF" });
        }
        const pdfBuffer = readFileSync(pdfPath);
        unlinkSync(tmpDocx);
        unlinkSync(pdfPath);
        const bucket = process.env.SUPABASE_BUCKET_REPORTES || "reportes";
        const safeEmpresa = (empresa || "empresa").replace(/\s+/g, "_").replace(/[^\w-]/g, "");
        const safePeriodo = (periodo || "Periodo").replace(/\s+/g, "_").replace(/[^\w-]/g, "");
        const pdfFileName = fileName.replace(/\.docx$/i, ".pdf");
        const storagePath = `${safeEmpresa}/${safePeriodo}/${pdfFileName}`;
        const { error: uploadError } = await supabaseAdmin.storage
            .from(bucket)
            .upload(storagePath, pdfBuffer, { contentType: "application/pdf", upsert: true });
        if (uploadError)
            throw uploadError;
        const { data: publicData } = supabaseAdmin.storage
            .from(bucket)
            .getPublicUrl(storagePath);
        const urlArchivo = publicData?.publicUrl ?? null;
        await prisma.reporteGenerado.create({
            data: {
                empresaId: empresaId ? Number(empresaId) : null,
                empresaNombre: empresa,
                periodo: periodo || "Periodo",
                tipo: "PDF",
                nombreArchivo: pdfFileName,
                urlArchivo,
                storagePath,
                generadoPorId: req.user?.id ?? null,
                generadoPor: req.user?.nombre ?? req.user?.email ?? null,
                estado: "GENERADO",
            },
        });
        return res.json({ ok: true, urlArchivo, storagePath });
    }
    catch (error) {
        console.error("convertDocxToPdf error:", error);
        return res.status(500).json({ ok: false, message: "Error convirtiendo o subiendo PDF" });
    }
}
//# sourceMappingURL=reportes-upload.controller.js.map