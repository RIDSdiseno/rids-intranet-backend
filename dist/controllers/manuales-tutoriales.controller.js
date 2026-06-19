import { Prisma, TipoManualTutorial } from "@prisma/client";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import multer from "multer";
import path from "path";
import crypto from "crypto";
import { supabaseAdmin, MANUALES_TUTORIALES_BUCKET, } from "../lib/supabase/supabase.js";
const listManualesSchema = z.object({
    search: z.string().trim().optional(),
    empresaId: z.coerce.number().int().positive().optional(),
    categoria: z.string().trim().optional(),
    tipo: z.nativeEnum(TipoManualTutorial).optional(),
    activo: z.coerce.boolean().optional(),
    visibleCliente: z.coerce.boolean().optional(),
});
const archivoManualSchema = z.object({
    nombreArchivo: z.string().trim().min(1, "El nombre del archivo es obligatorio"),
    urlArchivo: z.string().trim().url("La URL del archivo no es válida"),
});
const createManualSchema = z.object({
    titulo: z.string().trim().min(1, "El título es obligatorio"),
    descripcion: z.string().trim().optional().nullable(),
    categoria: z.string().trim().min(1, "La categoría es obligatoria"),
    problema: z.string().trim().min(1, "El problema es obligatorio"),
    solucion: z.string().trim().min(1, "La solución es obligatoria"),
    tipo: z.nativeEnum(TipoManualTutorial),
    empresaId: z.coerce.number().int().positive("La empresa es obligatoria"),
    urlArchivo: z.string().trim().url().optional().nullable(),
    archivos: z.array(archivoManualSchema).optional().default([]),
    urlVideo: z.string().trim().url().optional().nullable(),
    plataforma: z.string().trim().min(1, "La plataforma es obligatoria"),
    visibleCliente: z.boolean().optional().default(false),
    activo: z.boolean().optional().default(true),
});
const updateManualSchema = createManualSchema.partial();
const storage = multer.memoryStorage();
const allowedMimeTypes = [
    "application/pdf",
    "application/msword",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "application/vnd.ms-excel",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "application/vnd.ms-powerpoint",
    "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    "image/png",
    "image/jpeg",
    "image/jpg",
    "image/webp",
    "text/plain",
    "video/mp4",
    "video/quicktime",
    "video/webm",
    "video/x-matroska",
];
export const uploadManualTutorialMiddleware = multer({
    storage,
    limits: {
        fileSize: 25 * 1024 * 1024, // 25 MB
    },
    fileFilter: (_req, file, cb) => {
        if (!allowedMimeTypes.includes(file.mimetype)) {
            cb(new Error("Tipo de archivo no permitido"));
            return;
        }
        cb(null, true);
    },
});
function safeFileName(originalName) {
    const ext = path.extname(originalName).toLowerCase();
    const baseName = path
        .basename(originalName, ext)
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[^a-zA-Z0-9-_]+/g, "_")
        .replace(/_+/g, "_")
        .slice(0, 80);
    const random = crypto.randomBytes(8).toString("hex");
    return `${Date.now()}-${random}-${baseName || "archivo"}${ext}`;
}
function parseId(value) {
    const id = Number(value);
    if (!Number.isInteger(id) || id <= 0) {
        return null;
    }
    return id;
}
export async function listManualesTutoriales(req, res) {
    try {
        const q = listManualesSchema.parse(req.query);
        const user = req.user;
        const andConditions = [];
        if (q.search) {
            andConditions.push({
                OR: [
                    { titulo: { contains: q.search, mode: "insensitive" } },
                    { descripcion: { contains: q.search, mode: "insensitive" } },
                    { categoria: { contains: q.search, mode: "insensitive" } },
                    { problema: { contains: q.search, mode: "insensitive" } },
                    { solucion: { contains: q.search, mode: "insensitive" } },
                    { empresa: { is: { nombre: { contains: q.search, mode: "insensitive" } } } },
                ],
            });
        }
        if (user?.rol === "CLIENTE") {
            andConditions.push({
                empresaId: user.empresaId,
                visibleCliente: true,
                activo: true,
            });
        }
        else {
            if (q.empresaId) {
                andConditions.push({ empresaId: q.empresaId });
            }
            if (q.activo !== undefined) {
                andConditions.push({ activo: q.activo });
            }
            if (q.visibleCliente !== undefined) {
                andConditions.push({ visibleCliente: q.visibleCliente });
            }
        }
        if (q.categoria) {
            andConditions.push({
                categoria: { contains: q.categoria, mode: "insensitive" },
            });
        }
        if (q.tipo) {
            andConditions.push({ tipo: q.tipo });
        }
        const where = andConditions.length > 0 ? { AND: andConditions } : {};
        const items = await prisma.manualTutorial.findMany({
            where,
            include: {
                empresa: {
                    select: {
                        id_empresa: true,
                        nombre: true,
                    },
                },
                creadoPor: {
                    select: {
                        id_tecnico: true,
                        nombre: true,
                        email: true,
                    },
                },
                archivos: {
                    orderBy: {
                        createdAt: "asc",
                    },
                },
            },
            orderBy: {
                createdAt: "desc",
            },
        });
        return res.json({
            total: items.length,
            items,
        });
    }
    catch (err) {
        console.error("listManualesTutoriales error:", err);
        if (err instanceof z.ZodError) {
            return res.status(400).json({
                error: "Parámetros inválidos",
                details: err.flatten(),
            });
        }
        return res.status(500).json({
            error: "Error al listar manuales y tutoriales",
        });
    }
}
export async function getManualTutorialById(req, res) {
    try {
        const id = parseId(req.params.id);
        if (!id) {
            return res.status(400).json({ error: "ID inválido" });
        }
        const user = req.user;
        const item = await prisma.manualTutorial.findUnique({
            where: { id },
            include: {
                empresa: {
                    select: {
                        id_empresa: true,
                        nombre: true,
                    },
                },
                creadoPor: {
                    select: {
                        id_tecnico: true,
                        nombre: true,
                        email: true,
                    },
                },
            },
        });
        if (!item) {
            return res.status(404).json({ error: "Manual o tutorial no encontrado" });
        }
        if (user?.rol === "CLIENTE") {
            if (!item.activo ||
                !item.visibleCliente ||
                item.empresaId !== user.empresaId) {
                return res.status(403).json({ error: "No autorizado" });
            }
        }
        return res.json(item);
    }
    catch (err) {
        console.error("getManualTutorialById error:", err);
        return res.status(500).json({
            error: "Error al obtener manual o tutorial",
        });
    }
}
export async function createManualTutorial(req, res) {
    try {
        const body = createManualSchema.parse(req.body);
        const user = req.user;
        const item = await prisma.manualTutorial.create({
            data: {
                titulo: body.titulo,
                descripcion: body.descripcion ?? null,
                categoria: body.categoria,
                problema: body.problema,
                solucion: body.solucion,
                tipo: body.tipo,
                empresaId: body.empresaId,
                // Compatibilidad: primer archivo también queda en urlArchivo
                urlArchivo: body.urlArchivo ??
                    body.archivos?.[0]?.urlArchivo ??
                    null,
                urlVideo: body.urlVideo ?? null,
                plataforma: body.plataforma,
                visibleCliente: body.visibleCliente,
                activo: body.activo,
                creadoPorId: user?.id ?? null,
                ...(body.archivos?.length
                    ? {
                        archivos: {
                            create: body.archivos.map((archivo) => ({
                                nombreArchivo: archivo.nombreArchivo,
                                urlArchivo: archivo.urlArchivo,
                            })),
                        },
                    }
                    : {}),
            },
            include: {
                empresa: {
                    select: {
                        id_empresa: true,
                        nombre: true,
                    },
                },
                creadoPor: {
                    select: {
                        id_tecnico: true,
                        nombre: true,
                        email: true,
                    },
                },
                archivos: {
                    orderBy: {
                        createdAt: "asc",
                    },
                },
            },
        });
        return res.status(201).json(item);
    }
    catch (err) {
        console.error("createManualTutorial error:", err);
        if (err instanceof z.ZodError) {
            return res.status(400).json({
                error: "Datos inválidos",
                details: err.flatten(),
            });
        }
        return res.status(500).json({
            error: "Error al crear manual o tutorial",
        });
    }
}
export async function updateManualTutorial(req, res) {
    try {
        const id = parseId(req.params.id);
        if (!id) {
            return res.status(400).json({ error: "ID inválido" });
        }
        const body = updateManualSchema.parse(req.body);
        const item = await prisma.manualTutorial.update({
            where: { id },
            data: {
                ...(body.titulo !== undefined ? { titulo: body.titulo } : {}),
                ...(body.descripcion !== undefined ? { descripcion: body.descripcion ?? null } : {}),
                ...(body.categoria !== undefined ? { categoria: body.categoria } : {}),
                ...(body.problema !== undefined ? { problema: body.problema } : {}),
                ...(body.solucion !== undefined ? { solucion: body.solucion } : {}),
                ...(body.tipo !== undefined ? { tipo: body.tipo } : {}),
                ...(body.empresaId !== undefined ? { empresaId: body.empresaId } : {}),
                ...(body.archivos !== undefined
                    ? {
                        urlArchivo: body.urlArchivo ??
                            body.archivos?.[0]?.urlArchivo ??
                            null,
                        archivos: {
                            deleteMany: {},
                            create: body.archivos.map((archivo) => ({
                                nombreArchivo: archivo.nombreArchivo,
                                urlArchivo: archivo.urlArchivo,
                            })),
                        },
                    }
                    : body.urlArchivo !== undefined
                        ? { urlArchivo: body.urlArchivo ?? null }
                        : {}),
                ...(body.urlVideo !== undefined ? { urlVideo: body.urlVideo ?? null } : {}),
                ...(body.plataforma !== undefined ? { plataforma: body.plataforma } : {}),
                ...(body.visibleCliente !== undefined ? { visibleCliente: body.visibleCliente } : {}),
                ...(body.activo !== undefined ? { activo: body.activo } : {}),
            },
            include: {
                empresa: {
                    select: {
                        id_empresa: true,
                        nombre: true,
                    },
                },
                creadoPor: {
                    select: {
                        id_tecnico: true,
                        nombre: true,
                        email: true,
                    },
                },
                archivos: {
                    orderBy: {
                        createdAt: "asc",
                    },
                },
            },
        });
        return res.json(item);
    }
    catch (err) {
        console.error("updateManualTutorial error:", err);
        if (err?.code === "P2025") {
            return res.status(404).json({
                error: "Manual o tutorial no encontrado",
            });
        }
        if (err instanceof z.ZodError) {
            return res.status(400).json({
                error: "Datos inválidos",
                details: err.flatten(),
            });
        }
        return res.status(500).json({
            error: "Error al actualizar manual o tutorial",
        });
    }
}
export async function uploadManualTutorialFile(req, res) {
    try {
        const file = req.file;
        if (!file) {
            return res.status(400).json({
                ok: false,
                error: "No se recibió ningún archivo",
            });
        }
        const fileName = safeFileName(file.originalname);
        const storagePath = `manuales/${fileName}`;
        const { error: uploadError } = await supabaseAdmin.storage
            .from(MANUALES_TUTORIALES_BUCKET)
            .upload(storagePath, file.buffer, {
            contentType: file.mimetype,
            upsert: false,
        });
        if (uploadError) {
            console.error("Supabase upload error:", uploadError);
            return res.status(500).json({
                ok: false,
                error: "Error al subir archivo a Supabase",
                details: uploadError.message,
            });
        }
        const { data: publicData } = supabaseAdmin.storage
            .from(MANUALES_TUTORIALES_BUCKET)
            .getPublicUrl(storagePath);
        return res.status(201).json({
            ok: true,
            urlArchivo: publicData.publicUrl,
            storagePath,
            nombreArchivo: file.originalname,
            mimeType: file.mimetype,
            sizeBytes: file.size,
            bucket: MANUALES_TUTORIALES_BUCKET,
        });
    }
    catch (err) {
        console.error("uploadManualTutorialFile error:", err);
        return res.status(500).json({
            ok: false,
            error: err instanceof Error
                ? err.message
                : "Error al subir archivo del manual",
        });
    }
}
export async function deleteManualTutorial(req, res) {
    try {
        const id = parseId(req.params.id);
        if (!id) {
            return res.status(400).json({ error: "ID inválido" });
        }
        await prisma.manualTutorial.delete({
            where: { id },
        });
        return res.json({
            ok: true,
            message: "Manual o tutorial eliminado correctamente",
        });
    }
    catch (err) {
        console.error("deleteManualTutorial error:", err);
        if (err?.code === "P2025") {
            return res.status(404).json({
                error: "Manual o tutorial no encontrado",
            });
        }
        return res.status(500).json({
            error: "Error al eliminar manual o tutorial",
        });
    }
}
//# sourceMappingURL=manuales-tutoriales.controller.js.map