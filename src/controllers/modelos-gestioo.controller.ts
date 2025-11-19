import type { Request, Response } from "express";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

/* =====================================================
   CRUD: MODELOGESTIOO
===================================================== */

// ✅ Crear modelo
export async function createModelo(req: Request, res: Response) {
    try {
        const data = req.body;
        const nuevoModelo = await prisma.modeloGestioo.create({
            data: {
                nombre: data.nombre,
                marcaId: data.marcaId,
            },
            include: { marca: true },
        });
        res.status(201).json(nuevoModelo);
    } catch (error) {
        console.error("❌ Error al crear modelo:", error);
        res.status(500).json({ error: "Error al crear modelo" });
    }
}

// ✅ Obtener todos los modelos
export async function getModelos(_req: Request, res: Response) {
    try {
        const modelos = await prisma.modeloGestioo.findMany({
            orderBy: { id: "asc" },
            include: { marca: true },
        });
        res.json(modelos);
    } catch (error) {
        console.error("❌ Error al obtener modelos:", error);
        res.status(500).json({ error: "Error al obtener modelos" });
    }
}

// ✅ Obtener modelo por ID
export async function getModeloById(req: Request, res: Response) {
    try {
        const id = Number(req.params.id);
        const modelo = await prisma.modeloGestioo.findUnique({
            where: { id },
            include: { marca: true },
        });
        if (!modelo) return res.status(404).json({ error: "Modelo no encontrado" });
        res.json(modelo);
    } catch (error) {
        console.error("❌ Error al obtener modelo:", error);
        res.status(500).json({ error: "Error al obtener modelo" });
    }
    return res.status(500).json({        // ✅ RETURN OBLIGATORIO
        error: "Error al obtener modelo",
    });
}

// ✅ Actualizar modelo
export async function updateModelo(req: Request, res: Response) {
    try {
        const id = Number(req.params.id);
        const data = req.body;
        const modeloActualizado = await prisma.modeloGestioo.update({
            where: { id },
            data,
            include: { marca: true },
        });
        res.json(modeloActualizado);
    } catch (error) {
        console.error("❌ Error al actualizar modelo:", error);
        res.status(500).json({ error: "Error al actualizar modelo" });
    }
}

// ✅ Eliminar modelo
export async function deleteModelo(req: Request, res: Response) {
    try {
        const id = Number(req.params.id);
        await prisma.modeloGestioo.delete({ where: { id } });
        res.json({ message: "✅ Modelo eliminado correctamente" });
    } catch (error) {
        console.error("❌ Error al eliminar modelo:", error);
        res.status(500).json({ error: "Error al eliminar modelo" });
    }
}
