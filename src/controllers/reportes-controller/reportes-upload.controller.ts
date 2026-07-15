// src/controllers/reportes-upload.controller.ts
import type { Request, Response } from "express";
import fetch from "node-fetch";
import { resolveSharepointPathReporte } from "../../utils/sharepointPaths.js";
import { prisma } from "../../lib/prisma.js";
import { supabaseAdmin } from "../../lib/supabase/supabase.js";
import { execFile } from "child_process";
import {
    writeFileSync,
    readFileSync,
    existsSync,
    unlinkSync,
    mkdirSync,
    rmSync,
} from "fs";
import { pathToFileURL } from "url";
import { join } from "path";
import { tmpdir } from "os";
import { promisify } from "util";
import { enviarInformeResumenPorCorreo } from "../../service/reportes/ia-metricas-reportes/reportes-email/reportes-email.service.js";

function eliminarArchivoTemporal(path: string | null | undefined) {
    if (!path) return;

    try {
        if (existsSync(path)) {
            unlinkSync(path);
        }
    } catch (error) {
        console.warn(
            `[LibreOffice] No fue posible eliminar el archivo temporal: ${path}`,
            error
        );
    }
}

// ─── DOCX → SharePoint + Supabase ────────────────────────────────────────
export async function uploadReporteDocx(req: Request, res: Response) {
    try {
        const { fileName, empresaId, empresa, periodo, tipo, fileBase64 } = req.body as {
            fileName: string;
            empresaId?: number | string;
            empresa: string;
            periodo?: string;
            tipo?: string;
            fileBase64: string;
        };

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
        const response = await fetch(process.env.POWER_AUTOMATE_URL!, {
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
        let powerAutomateJson: any = null;
        try {
            powerAutomateJson = JSON.parse(responseText);
        } catch {
            throw new Error("Power Automate no devolvió un JSON válido.");
        }

        const sharepointUrl =
            powerAutomateJson?.urlArchivo ||
            powerAutomateJson?.webUrl ||
            powerAutomateJson?.url ||
            null;

        if (!sharepointUrl) {
            throw new Error("Power Automate no devolvió una URL de archivo.");
        }

        // 3. Subir también a Supabase (no crítico)
        let supabaseUrl: string | null = null;
        let supabaseStoragePath: string | null = null;

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
        } catch (err) {
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
                generadoPorId: (req as any).user?.id ?? null,
                generadoPor: (req as any).user?.nombre ?? (req as any).user?.email ?? null,
                estado: "GENERADO",
            },
        });

        return res.json({ ok: true, urlArchivo: supabaseUrl ?? sharepointUrl });
    } catch (err) {
        console.error("❌ uploadReporteDocx error:", err);
        return res.status(500).json({ ok: false, message: "Error enviando reporte a SharePoint" });
    }
}

// ─── Historial ────────────────────────────────────────────────────────────
export async function listHistorialReportes(req: Request, res: Response) {
    try {
        const user = (req as any).user;
        const esCliente = user?.rol === "CLIENTE";

        const empresaId =
            typeof req.query.empresaId === "string" && req.query.empresaId
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
    } catch (error) {
        console.error("❌ listHistorialReportes error:", error);
        return res.status(500).json({ ok: false, message: "Error obteniendo historial" });
    }
}

// ─── PDF → solo Supabase ──────────────────────────────────────────────────
export async function uploadReporteSupabase(req: Request, res: Response) {
    try {
        const { fileName, empresaId, empresa, periodo, tipo, fileBase64 } = req.body as {
            fileName: string;
            empresaId?: number | string;
            empresa: string;
            periodo?: string;
            tipo?: string;
            fileBase64: string;
        };

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

        if (uploadError) throw uploadError;

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
                generadoPorId: (req as any).user?.id ?? null,
                generadoPor: (req as any).user?.nombre ?? (req as any).user?.email ?? null,
                estado: "GENERADO",
            },
        });

        return res.json({ ok: true, urlArchivo, storagePath });
    } catch (error) {
        console.error("uploadReporteSupabase error:", error);
        return res.status(500).json({ ok: false, message: "Error subiendo reporte a Supabase" });
    }
}

// ─── DOCX → PDF via LibreOffice → Supabase ───────────────────────────────
const execFileAsync = promisify(execFile);

function obtenerLibreOfficePath(): string {
    const configuredPath =
        process.env.LIBREOFFICE_PATH?.trim();

    if (configuredPath) {
        return configuredPath;
    }

    if (process.platform === "win32") {
        return "C:\\Program Files\\LibreOffice\\program\\soffice.exe";
    }

    return "/usr/bin/libreoffice";
}

function crearPerfilTemporalLibreOffice(
    unique: string
): {
    profileDir: string;
    profileArgument: string;
} {
    const profileDir = join(
        tmpdir(),
        `libreoffice-profile-${unique}`
    );

    mkdirSync(profileDir, {
        recursive: true,
    });

    return {
        profileDir,
        profileArgument:
            `-env:UserInstallation=${pathToFileURL(
                profileDir
            ).href}`,
    };
}

function eliminarDirectorioTemporal(
    path: string | null | undefined
) {
    if (!path) return;

    try {
        if (existsSync(path)) {
            rmSync(path, {
                recursive: true,
                force: true,
            });
        }
    } catch (error) {
        console.warn(
            `[LibreOffice] No fue posible eliminar el directorio temporal: ${path}`,
            error
        );
    }
}

// ─── Preview DOCX → PDF temporal ──────────────────────────────────────────
export async function previewDocxToPdf(
    req: Request,
    res: Response
) {
    let tmpDocx: string | null = null;
    let pdfPath: string | null = null;
    let libreOfficeProfileDir: string | null = null;

    try {
        const { fileBase64, fileName } = req.body as {
            fileBase64: string;
            fileName: string;
        };

        if (!fileBase64 || !fileName) {
            return res.status(400).json({
                ok: false,
                message:
                    "fileBase64 y fileName son obligatorios",
            });
        }

        if (!fileName.toLowerCase().endsWith(".docx")) {
            return res.status(400).json({
                ok: false,
                message: "El archivo debe ser un DOCX.",
            });
        }

        const sizeMb =
            Buffer.byteLength(fileBase64, "base64") /
            (1024 * 1024);

        if (sizeMb > 20) {
            return res.status(413).json({
                ok: false,
                message:
                    "Archivo demasiado grande para previsualizar.",
            });
        }

        const safeName = fileName
            .replace(/\s+/g, "_")
            .replace(/[^\w.-]/g, "");

        const unique =
            `${Date.now()}_${Math.round(
                Math.random() * 100000
            )}`;

        const {
            profileDir,
            profileArgument,
        } = crearPerfilTemporalLibreOffice(unique);

        libreOfficeProfileDir = profileDir;

        tmpDocx = join(
            tmpdir(),
            `${unique}_${safeName}`
        );

        const tmpOutputDir = tmpdir();

        writeFileSync(
            tmpDocx,
            Buffer.from(fileBase64, "base64")
        );

        const libreOfficePath =
            obtenerLibreOfficePath();

        await execFileAsync(
            libreOfficePath,
            [
                "--headless",
                profileArgument,
                "--convert-to",
                "pdf",
                "--outdir",
                tmpOutputDir,
                tmpDocx,
            ],
            {
                timeout: 60_000,
                env: {
                    ...process.env,
                    HOME:
                        process.env.HOME ||
                        (process.platform === "win32"
                            ? process.env.USERPROFILE
                            : "/tmp"),
                },
            }
        );

        console.log(
            "[LibreOffice] Ejecutando preview con:",
            libreOfficePath
        );

        await execFileAsync(
            libreOfficePath,
            [
                "--headless",
                "--convert-to",
                "pdf",
                "--outdir",
                tmpOutputDir,
                tmpDocx,
            ],
            {
                timeout: 60_000,
                env: {
                    ...process.env,
                    HOME:
                        process.env.HOME ||
                        (process.platform === "win32"
                            ? process.env.USERPROFILE
                            : "/tmp"),
                },
            }
        );

        pdfPath = tmpDocx.replace(
            /\.docx$/i,
            ".pdf"
        );

        if (!existsSync(pdfPath)) {
            return res.status(500).json({
                ok: false,
                message:
                    "LibreOffice terminó, pero no generó el PDF de vista previa.",
            });
        }

        const pdfBuffer =
            readFileSync(pdfPath);

        return res.json({
            ok: true,
            fileName: safeName.replace(
                /\.docx$/i,
                ".pdf"
            ),
            mimeType: "application/pdf",
            fileBase64: pdfBuffer.toString("base64"),
        });
    } catch (error) {
        console.error(
            "previewDocxToPdf error:",
            error
        );

        return res.status(500).json({
            ok: false,
            message:
                "Error generando vista previa del DOCX.",
        });
    } finally {
        eliminarArchivoTemporal(tmpDocx);
        eliminarArchivoTemporal(pdfPath);
        eliminarDirectorioTemporal(
            libreOfficeProfileDir
        );
    }
}

export async function convertDocxToPdf(
    req: Request,
    res: Response
) {
    let tmpDocx: string | null = null;
    let pdfPath: string | null = null;
    let libreOfficeProfileDir: string | null = null;

    try {
        const {
            fileBase64,
            fileName,
            empresaId,
            empresa,
            periodo,
        } = req.body as {
            fileBase64: string;
            fileName: string;
            empresaId?: number | string;
            empresa: string;
            periodo?: string;
        };

        if (!fileBase64 || !fileName) {
            return res.status(400).json({
                ok: false,
                message:
                    "fileBase64 y fileName son obligatorios",
            });
        }

        if (!fileName.toLowerCase().endsWith(".docx")) {
            return res.status(400).json({
                ok: false,
                message:
                    "El archivo debe tener extensión DOCX.",
            });
        }

        const sizeMb =
            Buffer.byteLength(fileBase64, "base64") /
            (1024 * 1024);

        if (sizeMb > 20) {
            return res.status(413).json({
                ok: false,
                message:
                    "Archivo demasiado grande para convertir.",
            });
        }

        const unique =
            `${Date.now()}_${Math.round(
                Math.random() * 100000
            )}`;

        const {
            profileDir,
            profileArgument,
        } = crearPerfilTemporalLibreOffice(unique);

        libreOfficeProfileDir = profileDir;

        tmpDocx = join(
            tmpdir(),
            `${unique}_reporte.docx`
        );

        writeFileSync(
            tmpDocx,
            Buffer.from(fileBase64, "base64")
        );

        const libreOfficePath =
            obtenerLibreOfficePath();

        console.log(
            "[LibreOffice] Ejecutando conversión con:",
            libreOfficePath
        );

        await execFileAsync(
            libreOfficePath,
            [
                "--headless",
                profileArgument,
                "--convert-to",
                "pdf",
                "--outdir",
                tmpdir(),
                tmpDocx,
            ],
            {
                timeout: 60_000,
                env: {
                    ...process.env,
                    HOME:
                        process.env.HOME ||
                        (process.platform === "win32"
                            ? process.env.USERPROFILE
                            : "/tmp"),
                },
            }
        );

        pdfPath = tmpDocx.replace(
            /\.docx$/i,
            ".pdf"
        );

        if (!existsSync(pdfPath)) {
            return res.status(500).json({
                ok: false,
                message:
                    "LibreOffice terminó, pero no se generó el PDF.",
            });
        }

        const pdfBuffer =
            readFileSync(pdfPath);

        const bucket =
            process.env.SUPABASE_BUCKET_REPORTES ||
            "reportes";

        const safeEmpresa = (empresa || "empresa")
            .replace(/\s+/g, "_")
            .replace(/[^\w-]/g, "");

        const safePeriodo = (periodo || "Periodo")
            .replace(/\s+/g, "_")
            .replace(/[^\w-]/g, "");

        const pdfFileName = fileName.replace(
            /\.docx$/i,
            ".pdf"
        );

        const storagePath =
            `${safeEmpresa}/${safePeriodo}/${pdfFileName}`;

        const { error: uploadError } =
            await supabaseAdmin.storage
                .from(bucket)
                .upload(storagePath, pdfBuffer, {
                    contentType: "application/pdf",
                    upsert: true,
                });

        if (uploadError) {
            throw uploadError;
        }

        const { data: publicData } =
            supabaseAdmin.storage
                .from(bucket)
                .getPublicUrl(storagePath);

        const urlArchivo =
            publicData?.publicUrl ?? null;

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
                generadoPorId:
                    (req as any).user?.id ?? null,
                generadoPor:
                    (req as any).user?.nombre ??
                    (req as any).user?.email ??
                    null,
                estado: "GENERADO",
            },
        });

        return res.json({
            ok: true,
            urlArchivo,
            storagePath,
        });
    } catch (error) {
        console.error(
            "convertDocxToPdf error:",
            error
        );

        return res.status(500).json({
            ok: false,
            message:
                error instanceof Error
                    ? error.message
                    : "Error convirtiendo o subiendo PDF",
        });
    } finally {
        eliminarArchivoTemporal(tmpDocx);
        eliminarArchivoTemporal(pdfPath);
        eliminarDirectorioTemporal(
            libreOfficeProfileDir
        );
    }
}
// Envía el informe resumido generado desde el frontend como adjunto PDF.
export async function enviarInformeResumenCorreo(req: Request, res: Response) {
    try {
        const {
            destinatario,
            destinatarios,
            cc,
            asunto,
            mensaje,
            fileName,
            mimeType,
            fileBase64,
            empresa,
            periodo,
            tipo,
        } = req.body as {
            destinatario?: string;
            destinatarios?: string[] | string;
            cc?: string[] | string;
            asunto: string;
            mensaje?: string;
            fileName: string;
            mimeType: string;
            fileBase64: string;
            empresa?: string;
            periodo?: string;
            tipo?: string;
        };

        // Validaciones para que la UI reciba errores claros.
        const destinatariosFinal =
            destinatarios ??
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
        const emailPayload: Parameters<typeof enviarInformeResumenPorCorreo>[0] = {
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
    } catch (error: any) {
        console.error("❌ enviarInformeResumenCorreo error:", error);

        return res.status(500).json({
            ok: false,
            message:
                error?.message ||
                "Error al enviar el informe resumido por correo.",
        });
    }
}