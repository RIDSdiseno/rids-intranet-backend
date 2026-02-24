import type { Request, Response } from "express";
import { prisma } from "../../lib/prisma.js";
import { z } from "zod";
import { getCurrentUserId } from "../../lib/request-context.js";

/* ============================================================
   🔹 Schemas
============================================================ */

const servidorCreateSchema = z.object({
    empresaId: z.number().int().positive(),
    nombre: z.string().min(1),
    nombreUsuario: z.string().min(1),
    contrasena: z.string().min(1),
    ipExterna: z.string().min(1),
});

const servidorUpdateSchema = z.object({
    nombre: z.string().min(1).optional(),        // ✅ agregado
    nombreUsuario: z.string().optional(),
    contrasena: z.string().optional(),
    ipExterna: z.string().optional(),
    probado: z.boolean().optional(),
    // ❌ "usuario" eliminado — no existe en el modelo Servidor
});

/* ============================================================
   GET /api/ficha-empresa/:empresaId/servidores
============================================================ */

export async function getServidoresByEmpresa(
    req: Request,
    res: Response
): Promise<void> {
    try {
        const empresaId = Number(req.params.empresaId);

        if (isNaN(empresaId)) {
            res.status(400).json({ success: false, error: "empresaId inválido" });
            return;
        }

        const servidores = await prisma.servidor.findMany({
            where: { empresaId },
            include: {
                _count: {
                    select: { servidorUsuarios: true },
                },
            },
            orderBy: { createdAt: "desc" },
        });

        res.json({ success: true, data: servidores });
    } catch (error) {
        console.error("getServidoresByEmpresa error:", error);
        res.status(500).json({ success: false, error: "Error interno" });
    }
}

/* ============================================================
   GET /api/ficha-empresa/servidores/:id
============================================================ */

export async function getServidorById(
    req: Request,
    res: Response
): Promise<void> {
    try {
        const id = Number(req.params.id);

        const servidor = await prisma.servidor.findUnique({
            where: { id },
        });

        if (!servidor) {
            res.status(404).json({ success: false, error: "Servidor no encontrado" });
            return;
        }

        res.json({ success: true, data: servidor });
    } catch (error) {
        console.error("getServidorById error:", error);
        res.status(500).json({ success: false, error: "Error interno" });
    }
}

/* ============================================================
   POST /api/ficha-empresa/servidores
============================================================ */

export async function createServidor(
    req: Request,
    res: Response
): Promise<void> {
    console.log("[CONTROLLER] createServidor userId:", getCurrentUserId());
    try {
        const data = servidorCreateSchema.parse(req.body);

        const empresa = await prisma.empresa.findUnique({
            where: { id_empresa: data.empresaId },
            select: { id_empresa: true },
        });

        if (!empresa) {
            res.status(404).json({ success: false, error: "Empresa no encontrada" });
            return;
        }

        const nuevo = await prisma.servidor.create({
            data: {
                empresaId: data.empresaId,
                nombre: data.nombre,
                nombreUsuario: data.nombreUsuario,
                contrasena: data.contrasena,
                ipExterna: data.ipExterna,
            },
        });

        res.status(201).json({ success: true, data: nuevo });
    } catch (error) {
        console.error("createServidor error:", error);

        if (error instanceof z.ZodError) {
            res.status(400).json({
                success: false,
                error: "Datos inválidos",
                details: error.flatten(),
            });
            return;
        }

        res.status(500).json({ success: false, error: "Error al crear servidor" });
    }
}

/* ============================================================
   PUT /api/ficha-empresa/servidores/:id
============================================================ */

export async function updateServidor(
    req: Request,
    res: Response
): Promise<void> {
    console.log("[CONTROLLER] updateServidor userId:", getCurrentUserId());
    try {
        const id = Number(req.params.id);

        if (isNaN(id)) {
            res.status(400).json({ success: false, error: "ID inválido" });
            return;
        }

        const parsed = servidorUpdateSchema.parse(req.body);

        // Solo incluir campos que vienen en el body
        const data: Record<string, any> = {};
        if (parsed.nombre !== undefined) data.nombre = parsed.nombre;             // ✅
        if (parsed.nombreUsuario !== undefined) data.nombreUsuario = parsed.nombreUsuario;
        if (parsed.contrasena !== undefined) data.contrasena = parsed.contrasena;
        if (parsed.ipExterna !== undefined) data.ipExterna = parsed.ipExterna;
        if (parsed.probado !== undefined) data.probado = parsed.probado;

        if (Object.keys(data).length === 0) {
            res.status(400).json({ success: false, error: "No hay campos para actualizar" });
            return;
        }

        const actualizado = await prisma.servidor.update({
            where: { id },
            data,
        });

        res.json({ success: true, data: actualizado });
    } catch (error) {
        console.error("updateServidor error:", error);

        if (error instanceof z.ZodError) {
            res.status(400).json({
                success: false,
                error: "Datos inválidos",
                details: error.flatten(),
            });
            return;
        }

        res.status(500).json({ success: false, error: "Error al actualizar servidor" });
    }
}

/* ============================================================
   PATCH /api/ficha-empresa/servidores/:id/probado
============================================================ */

export async function toggleServidorProbado(
    req: Request,
    res: Response
): Promise<void> {
    try {
        const id = Number(req.params.id);

        const servidor = await prisma.servidor.findUnique({
            where: { id },
        });

        if (!servidor) {
            res.status(404).json({ success: false, error: "Servidor no encontrado" });
            return;
        }

        const actualizado = await prisma.servidor.update({
            where: { id },
            data: { probado: !servidor.probado },
        });

        res.json({ success: true, data: actualizado });
    } catch (error) {
        console.error("toggleServidorProbado error:", error);
        res.status(500).json({ success: false, error: "Error interno" });
    }
}

/* ============================================================
   DELETE /api/ficha-empresa/servidores/:id
============================================================ */

export async function deleteServidor(
    req: Request,
    res: Response
): Promise<void> {
    console.log("[CONTROLLER] deleteServidor userId:", getCurrentUserId());
    try {
        const id = Number(req.params.id);

        const existente = await prisma.servidor.findUnique({
            where: { id },
            select: { id: true },
        });

        if (!existente) {
            res.status(404).json({ success: false, error: "Servidor no encontrado" });
            return;
        }

        await prisma.servidor.delete({
            where: { id },
        });

        res.json({ success: true, message: "Servidor eliminado correctamente" });
    } catch (error) {
        console.error("deleteServidor error:", error);
        res.status(500).json({ success: false, error: "Error al eliminar servidor" });
    }
}