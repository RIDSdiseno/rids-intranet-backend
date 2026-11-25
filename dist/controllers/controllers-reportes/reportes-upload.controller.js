import fetch from "node-fetch";
import { resolveSharepointPathReporte } from "../../utils/sharepointPaths.js";
import { prisma } from "../../lib/prisma.js";
import { supabaseAdmin } from "../../lib/supabase/supabase.js";
import { execFile } from "child_process";
import { writeFileSync, readFileSync, existsSync, unlinkSync, mkdirSync, rmSync, } from "fs";
import { pathToFileURL } from "url";
import { join } from "path";
import { tmpdir } from "os";
import { promisify } from "util";
import { enviarInformeResumenPorCorreo } from "../../service/reportes/ia-metricas-reportes/reportes-email/reportes-email.service.js";
function eliminarArchivoTemporal(path) {
    if (!path)
        return;
    try {
        if (existsSync(path)) {
            unlinkSync(path);
        }
    }
    catch (error) {
        console.warn(`[LibreOffice] No fue posible eliminar el archivo temporal: ${path}`, error);
    }
}
// ─── DOCX → Supabase (obligatorio) + SharePoint (opcional) ──────────────────
/*
 * Guarda Word normal (tipo DOCX) y Word IA (tipo DOCX_IA).
 * - Supabase es la copia principal: si falla, no se registra nada.
 * - SharePoint (Power Automate) ya no bloquea: si falla, el reporte igual
 *   queda en el historial con estado SIN_SHAREPOINT.
 * - Cada guardado es una versión nueva: el archivo en Supabase lleva un
 *   prefijo de fecha para no pisar versiones anteriores.
 */
export async function uploadReporteDocx(req, res) {
    try {
        const { fileName, empresaId, empresa, periodo, tipo, fileBase64 } = req.body;
        if (!fileName || !empresa || !fileBase64) {
            return res.status(400).json({ ok: false, message: "fileName, empresa y fileBase64 son obligatorios" });
        }
        const sizeMb = Buffer.byteLength(fileBase64, "base64") / (1024 * 1024);
        if (sizeMb > 20) {
            return res.status(413).json({ ok: false, message: "Archivo demasiado grande" });
        }
        const tipoFinal = tipo === "DOCX_IA" ? "DOCX_IA" : "DOCX";
        // 1. Supabase (obligatorio)
        const bucket = process.env.SUPABASE_BUCKET_REPORTES || "reportes";
        const bufferDocx = Buffer.from(fileBase64, "base64");
        const safeEmpresa = empresa.replace(/\s+/g, "_").replace(/[^\w-]/g, "");
        const safePeriodo = (periodo || "Periodo").replace(/\s+/g, "_").replace(/[^\w-]/g, "");
        const supabaseStoragePath = `${safeEmpresa}/${safePeriodo}/${Date.now()}_${fileName}`;
        const { error: uploadError } = await supabaseAdmin.storage
            .from(bucket)
            .upload(supabaseStoragePath, bufferDocx, {
            contentType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            upsert: false,
        });
        if (uploadError) {
            console.error("❌ uploadReporteDocx Supabase:", uploadError);
            return res.status(500).json({ ok: false, message: "No se pudo guardar el Word en el almacenamiento" });
        }
        const { data: publicData } = supabaseAdmin.storage
            .from(bucket)
            .getPublicUrl(supabaseStoragePath);
        const supabaseUrl = publicData?.publicUrl ?? null;
        // 2. SharePoint vía Power Automate (no crítico)
        const sharepointPath = resolveSharepointPathReporte(empresa);
        let sharepointUrl = null;
        let avisoSharepoint = null;
        if (!sharepointPath) {
            avisoSharepoint = `No existe ruta SharePoint para ${empresa}`;
        }
        else if (!process.env.POWER_AUTOMATE_URL) {
            avisoSharepoint = "POWER_AUTOMATE_URL no está configurada";
        }
        else {
            try {
                const response = await fetch(process.env.POWER_AUTOMATE_URL, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ fileName, fileBase64, sharepointPath }),
                });
                const responseText = await response.text();
                if (!response.ok) {
                    throw new Error(`Power Automate failed (${response.status}): ${responseText.slice(0, 300)}`);
                }
                const powerAutomateJson = responseText ? JSON.parse(responseText) : null;
                sharepointUrl =
                    powerAutomateJson?.urlArchivo ||
                        powerAutomateJson?.webUrl ||
                        powerAutomateJson?.url ||
                        null;
                if (!sharepointUrl) {
                    avisoSharepoint = "Power Automate no devolvió la URL del archivo";
                }
            }
            catch (err) {
                console.error("⚠️ uploadReporteDocx SharePoint (no crítico):", err);
                avisoSharepoint = "No se pudo subir a SharePoint";
            }
        }
        // 3. Registro en el historial
        const registro = await prisma.reporteGenerado.create({
            data: {
                empresaId: empresaId ? Number(empresaId) : null,
                empresaNombre: empresa,
                periodo: periodo || "Periodo",
                tipo: tipoFinal,
                nombreArchivo: fileName,
                urlArchivo: supabaseUrl ?? sharepointUrl,
                sharepointPath: sharepointPath ?? null,
                storagePath: supabaseStoragePath,
                generadoPorId: req.user?.id ?? null,
                generadoPor: req.user?.nombre ?? req.user?.email ?? null,
                estado: sharepointUrl ? "GENERADO" : "SIN_SHAREPOINT",
            },
        });
        return res.json({
            ok: true,
            id: registro.id,
            urlArchivo: supabaseUrl ?? sharepointUrl,
            sharepoint: Boolean(sharepointUrl),
            avisoSharepoint,
        });
    }
    catch (err) {
        console.error("❌ uploadReporteDocx error:", err);
        return res.status(500).json({ ok: false, message: "Error guardando el reporte" });
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
        // Prefijo de fecha: cada guardado es una versión y no pisa la anterior
        const storagePath = `${safeEmpresa}/${safePeriodo}/${Date.now()}_${fileName}`;
        const contentType = fileName.endsWith(".docx")
            ? "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
            : "application/pdf";
        const { error: uploadError } = await supabaseAdmin.storage
            .from(bucket)
            .upload(storagePath, buffer, { contentType, upsert: false });
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
const execFileAsync = promisify(execFile);
function obtenerLibreOfficePath() {
    const configuredPath = process.env.LIBREOFFICE_PATH?.trim();
    if (configuredPath) {
        return configuredPath;
    }
    if (process.platform === "win32") {
        return "C:\\Program Files\\LibreOffice\\program\\soffice.exe";
    }
    return "/usr/bin/libreoffice";
}
function crearPerfilTemporalLibreOffice(unique) {
    const profileDir = join(tmpdir(), `libreoffice-profile-${unique}`);
    mkdirSync(profileDir, {
        recursive: true,
    });
    return {
        profileDir,
        profileArgument: `-env:UserInstallation=${pathToFileURL(profileDir).href}`,
    };
}
function eliminarDirectorioTemporal(path) {
    if (!path)
        return;
    try {
        if (existsSync(path)) {
            rmSync(path, {
                recursive: true,
                force: true,
            });
        }
    }
    catch (error) {
        console.warn(`[LibreOffice] No fue posible eliminar el directorio temporal: ${path}`, error);
    }
}
// ─── Preview DOCX → PDF temporal ──────────────────────────────────────────
export async function previewDocxToPdf(req, res) {
    let tmpDocx = null;
    let pdfPath = null;
    let libreOfficeProfileDir = null;
    try {
        const { fileBase64, fileName } = req.body;
        if (!fileBase64 || !fileName) {
            return res.status(400).json({
                ok: false,
                message: "fileBase64 y fileName son obligatorios",
            });
        }
        if (!fileName.toLowerCase().endsWith(".docx")) {
            return res.status(400).json({
                ok: false,
                message: "El archivo debe ser un DOCX.",
            });
        }
        const sizeMb = Buffer.byteLength(fileBase64, "base64") /
            (1024 * 1024);
        if (sizeMb > 20) {
            return res.status(413).json({
                ok: false,
                message: "Archivo demasiado grande para previsualizar.",
            });
        }
        const safeName = fileName
            .replace(/\s+/g, "_")
            .replace(/[^\w.-]/g, "");
        const unique = `${Date.now()}_${Math.round(Math.random() * 100000)}`;
        const { profileDir, profileArgument, } = crearPerfilTemporalLibreOffice(unique);
        libreOfficeProfileDir = profileDir;
        tmpDocx = join(tmpdir(), `${unique}_${safeName}`);
        const tmpOutputDir = tmpdir();
        writeFileSync(tmpDocx, Buffer.from(fileBase64, "base64"));
        const libreOfficePath = obtenerLibreOfficePath();
        await execFileAsync(libreOfficePath, [
            "--headless",
            profileArgument,
            "--convert-to",
            "pdf",
            "--outdir",
            tmpOutputDir,
            tmpDocx,
        ], {
            timeout: 60_000,
            env: {
                ...process.env,
                HOME: process.env.HOME ||
                    (process.platform === "win32"
                        ? process.env.USERPROFILE
                        : "/tmp"),
            },
        });
        await execFileAsync(libreOfficePath, [
            "--headless",
            "--convert-to",
            "pdf",
            "--outdir",
            tmpOutputDir,
            tmpDocx,
        ], {
            timeout: 60_000,
            env: {
                ...process.env,
                HOME: process.env.HOME ||
                    (process.platform === "win32"
                        ? process.env.USERPROFILE
                        : "/tmp"),
            },
        });
        pdfPath = tmpDocx.replace(/\.docx$/i, ".pdf");
        if (!existsSync(pdfPath)) {
            return res.status(500).json({
                ok: false,
                message: "LibreOffice terminó, pero no generó el PDF de vista previa.",
            });
        }
        const pdfBuffer = readFileSync(pdfPath);
        return res.json({
            ok: true,
            fileName: safeName.replace(/\.docx$/i, ".pdf"),
            mimeType: "application/pdf",
            fileBase64: pdfBuffer.toString("base64"),
        });
    }
    catch (error) {
        console.error("previewDocxToPdf error:", error);
        return res.status(500).json({
            ok: false,
            message: "Error generando vista previa del DOCX.",
        });
    }
    finally {
        eliminarArchivoTemporal(tmpDocx);
        eliminarArchivoTemporal(pdfPath);
        eliminarDirectorioTemporal(libreOfficeProfileDir);
    }
}
export async function convertDocxToPdf(req, res) {
    let tmpDocx = null;
    let pdfPath = null;
    let libreOfficeProfileDir = null;
    try {
        const { fileBase64, fileName, empresaId, empresa, periodo, } = req.body;
        if (!fileBase64 || !fileName) {
            return res.status(400).json({
                ok: false,
                message: "fileBase64 y fileName son obligatorios",
            });
        }
        if (!fileName.toLowerCase().endsWith(".docx")) {
            return res.status(400).json({
                ok: false,
                message: "El archivo debe tener extensión DOCX.",
            });
        }
        const sizeMb = Buffer.byteLength(fileBase64, "base64") /
            (1024 * 1024);
        if (sizeMb > 20) {
            return res.status(413).json({
                ok: false,
                message: "Archivo demasiado grande para convertir.",
            });
        }
        const unique = `${Date.now()}_${Math.round(Math.random() * 100000)}`;
        const { profileDir, profileArgument, } = crearPerfilTemporalLibreOffice(unique);
        libreOfficeProfileDir = profileDir;
        tmpDocx = join(tmpdir(), `${unique}_reporte.docx`);
        writeFileSync(tmpDocx, Buffer.from(fileBase64, "base64"));
        const libreOfficePath = obtenerLibreOfficePath();
        console.log("[LibreOffice] Ejecutando conversión con:", libreOfficePath);
        await execFileAsync(libreOfficePath, [
            "--headless",
            profileArgument,
            "--convert-to",
            "pdf",
            "--outdir",
            tmpdir(),
            tmpDocx,
        ], {
            timeout: 60_000,
            env: {
                ...process.env,
                HOME: process.env.HOME ||
                    (process.platform === "win32"
                        ? process.env.USERPROFILE
                        : "/tmp"),
            },
        });
        pdfPath = tmpDocx.replace(/\.docx$/i, ".pdf");
        if (!existsSync(pdfPath)) {
            return res.status(500).json({
                ok: false,
                message: "LibreOffice terminó, pero no se generó el PDF.",
            });
        }
        const pdfBuffer = readFileSync(pdfPath);
        const bucket = process.env.SUPABASE_BUCKET_REPORTES ||
            "reportes";
        const safeEmpresa = (empresa || "empresa")
            .replace(/\s+/g, "_")
            .replace(/[^\w-]/g, "");
        const safePeriodo = (periodo || "Periodo")
            .replace(/\s+/g, "_")
            .replace(/[^\w-]/g, "");
        const pdfFileName = fileName.replace(/\.docx$/i, ".pdf");
        const storagePath = `${safeEmpresa}/${safePeriodo}/${pdfFileName}`;
        const { error: uploadError } = await supabaseAdmin.storage
            .from(bucket)
            .upload(storagePath, pdfBuffer, {
            contentType: "application/pdf",
            upsert: true,
        });
        if (uploadError) {
            throw uploadError;
        }
        const { data: publicData } = supabaseAdmin.storage
            .from(bucket)
            .getPublicUrl(storagePath);
        const urlArchivo = publicData?.publicUrl ?? null;
        await prisma.reporteGenerado.create({
            data: {
                empresaId: empresaId
                    ? Number(empresaId)
                    : null,
                empresaNombre: empresa,
                periodo: periodo || "Periodo",
                tipo: "PDF",
                nombreArchivo: pdfFileName,
                urlArchivo,
                storagePath,
                generadoPorId: req.user?.id ?? null,
                generadoPor: req.user?.nombre ??
                    req.user?.email ??
                    null,
                estado: "GENERADO",
            },
        });
        return res.json({
            ok: true,
            urlArchivo,
            storagePath,
        });
    }
    catch (error) {
        console.error("convertDocxToPdf error:", error);
        return res.status(500).json({
            ok: false,
            message: error instanceof Error
                ? error.message
                : "Error convirtiendo o subiendo PDF",
        });
    }
    finally {
        eliminarArchivoTemporal(tmpDocx);
        eliminarArchivoTemporal(pdfPath);
        eliminarDirectorioTemporal(libreOfficeProfileDir);
    }
}
// Envía el informe resumido generado desde el frontend como adjunto PDF.
// ─── Ver un Word del historial como PDF (conversión al abrir) ───────────────
/*
 * Convierte un DOCX a PDF con LibreOffice (una sola ejecución, perfil
 * temporal propio). Lanza error si LibreOffice no genera el PDF.
 */
async function convertirDocxBufferAPdf(buffer, fileName) {
    const safeName = fileName.replace(/\s+/g, "_").replace(/[^\w.-]/g, "") || "reporte.docx";
    const unique = `${Date.now()}_${Math.round(Math.random() * 100000)}`;
    const { profileDir, profileArgument } = crearPerfilTemporalLibreOffice(unique);
    const tmpDocx = join(tmpdir(), `${unique}_${safeName.replace(/\.docx$/i, "")}.docx`);
    const pdfPath = tmpDocx.replace(/\.docx$/i, ".pdf");
    try {
        writeFileSync(tmpDocx, buffer);
        await execFileAsync(obtenerLibreOfficePath(), ["--headless", profileArgument, "--convert-to", "pdf", "--outdir", tmpdir(), tmpDocx], {
            timeout: 60_000,
            env: {
                ...process.env,
                HOME: process.env.HOME ||
                    (process.platform === "win32" ? process.env.USERPROFILE : "/tmp"),
            },
        });
        if (!existsSync(pdfPath)) {
            throw new Error("LibreOffice terminó, pero no generó el PDF.");
        }
        return readFileSync(pdfPath);
    }
    finally {
        eliminarArchivoTemporal(tmpDocx);
        eliminarArchivoTemporal(pdfPath);
        eliminarDirectorioTemporal(profileDir);
    }
}
/* GET /reportes-upload/:id/pdf → PDF (application/pdf) del reporte guardado */
export async function verReporteComoPdf(req, res) {
    try {
        const id = Number(req.params.id);
        if (!Number.isInteger(id) || id <= 0) {
            return res.status(400).json({ ok: false, message: "ID inválido" });
        }
        const reporte = await prisma.reporteGenerado.findUnique({ where: { id } });
        if (!reporte) {
            return res.status(404).json({ ok: false, message: "Reporte no encontrado" });
        }
        const user = req.user;
        if (user?.rol === "CLIENTE" && reporte.empresaId !== user.empresaId) {
            return res.status(403).json({ ok: false, message: "No tienes acceso a este reporte" });
        }
        if (!reporte.storagePath) {
            return res.status(409).json({
                ok: false,
                code: "SIN_COPIA_LOCAL",
                message: "Este reporte solo está en SharePoint; no hay copia para convertir.",
            });
        }
        const bucket = process.env.SUPABASE_BUCKET_REPORTES || "reportes";
        const { data, error } = await supabaseAdmin.storage.from(bucket).download(reporte.storagePath);
        if (error || !data) {
            console.error("❌ verReporteComoPdf download:", error);
            return res.status(404).json({ ok: false, message: "No se encontró el archivo del reporte" });
        }
        const buffer = Buffer.from(await data.arrayBuffer());
        const esDocx = reporte.nombreArchivo.toLowerCase().endsWith(".docx");
        const pdfBuffer = esDocx ? await convertirDocxBufferAPdf(buffer, reporte.nombreArchivo) : buffer;
        const nombrePdf = reporte.nombreArchivo.replace(/\.docx$/i, ".pdf");
        res.setHeader("Content-Type", "application/pdf");
        res.setHeader("Content-Disposition", `inline; filename*=UTF-8''${encodeURIComponent(nombrePdf)}`);
        return res.send(pdfBuffer);
    }
    catch (error) {
        console.error("❌ verReporteComoPdf error:", error);
        return res.status(500).json({ ok: false, message: "No se pudo convertir el reporte a PDF" });
    }
}
export async function enviarInformeResumenCorreo(req, res) {
    try {
        const { destinatario, destinatarios, cc, asunto, mensaje, fileName, mimeType, fileBase64, empresa, periodo, tipo, } = req.body;
        // Validaciones para que la UI reciba errores claros.
        const destinatariosFinal = destinatarios ??
            destinatario ??
            "";
        const destinatariosTexto = Array.isArray(destinatariosFinal)
            ? destinatariosFinal.join(",")
            : String(destinatariosFinal);
        if (!destinatariosTexto.trim()) {
            return res.status(400).json({
                ok: false,
                message: "Debes ingresar al menos un correo destinatario.",
            });
        }
        if (!asunto?.trim()) {
            return res.status(400).json({
                ok: false,
                message: "Debes ingresar un asunto para el correo.",
            });
        }
        if (!fileName || !mimeType || !fileBase64) {
            return res.status(400).json({
                ok: false,
                message: "No se recibió el archivo del informe.",
            });
        }
        // Construimos el payload evitando enviar propiedades con valor undefined.
        // Esto es necesario porque el proyecto usa exactOptionalPropertyTypes: true.
        const emailPayload = {
            to: Array.isArray(destinatariosFinal)
                ? destinatariosFinal
                : String(destinatariosFinal)
                    .split(/[,;\n\r]+/g)
                    .map((email) => email.trim())
                    .filter(Boolean),
            subject: asunto,
            fileName,
            mimeType,
            fileBase64,
        };
        if (cc) {
            emailPayload.cc = Array.isArray(cc)
                ? cc
                : String(cc)
                    .split(/[,;\n\r]+/g)
                    .map((email) => email.trim())
                    .filter(Boolean);
        }
        // Solo agregamos mensaje si realmente viene con contenido.
        if (mensaje?.trim()) {
            emailPayload.mensaje = mensaje.trim();
        }
        // Solo agregamos empresa si viene definida.
        if (empresa?.trim()) {
            emailPayload.empresa = empresa.trim();
        }
        // Solo agregamos periodo si viene definido.
        if (periodo?.trim()) {
            emailPayload.periodo = periodo.trim();
        }
        await enviarInformeResumenPorCorreo(emailPayload);
        return res.json({
            ok: true,
            message: "Informe resumido enviado por correo correctamente.",
            tipo: tipo || "INFORME_RESUMIDO",
        });
    }
    catch (error) {
        console.error("❌ enviarInformeResumenCorreo error:", error);
        return res.status(500).json({
            ok: false,
            message: error?.message ||
                "Error al enviar el informe resumido por correo.",
        });
    }
}
//# sourceMappingURL=reportes-upload.controller.js.map