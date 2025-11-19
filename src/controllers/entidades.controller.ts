import fs from "fs/promises";
import path from "path";
import type { Request, Response } from "express";
import { PrismaClient, TipoEntidadGestioo, OrigenGestioo } from "@prisma/client";

const prisma = new PrismaClient();

export async function seedEntidadesRIDS(_req: Request, res: Response) {
    try {
        const filePath = path.resolve("prisma/entidades_rids_seed.json");
        const fileContent = await fs.readFile(filePath, "utf8");
        const entidadesRIDS = JSON.parse(fileContent);

        const data = entidadesRIDS.map((e: any) => ({
            nombre: e.nombre,
            rut: e.rut,
            correo: e.correo,
            telefono: e.telefono,
            direccion: e.direccion,
            tipo: TipoEntidadGestioo.EMPRESA,
            origen: OrigenGestioo.RIDS,
        }));

        const result = await prisma.entidadGestioo.createMany({
            data,
            skipDuplicates: true,
        });

        res.status(201).json({
            message: `✅ Se insertaron ${result.count} entidades RIDS correctamente.`,
        });
    } catch (error) {
        console.error("❌ Error al poblar entidades RIDS:", error);
        res.status(500).json({
            error: "Error al poblar entidades RIDS",
            detalles: (error as Error).message,
        });
    }
}

export async function seedEntidadesECCONET(_req: Request, res: Response) {
    try {
        const filePath = path.resolve("prisma/entidades_ecconet_seed.json");
        const fileContent = await fs.readFile(filePath, "utf8");
        const entidadesECCONET = JSON.parse(fileContent);

        const data = entidadesECCONET.map((e: any) => ({
            nombre: e.nombre,
            rut: e.rut,
            correo: e.correo,
            telefono: e.telefono,
            direccion: e.direccion,
            tipo: TipoEntidadGestioo.EMPRESA,
            origen: OrigenGestioo.ECCONET,
        }));

        const result = await prisma.entidadGestioo.createMany({
            data,
            skipDuplicates: true,
        });

        res.status(201).json({
            message: `✅ Se insertaron ${result.count} entidades ECCONET correctamente.`,
        });
    } catch (error) {
        console.error("❌ Error al poblar entidades ECCONET:", error);
        res.status(500).json({
            error: "Error al poblar entidades ECCONET",
            detalles: (error as Error).message,
        });
    }
}

/* =====================================================
   CRUD: ENTIDADGESTIOO
===================================================== */

// ✅ Crear entidad
export async function createEntidad(req: Request, res: Response) {
    try {
        const data = req.body;
        const nuevaEntidad = await prisma.entidadGestioo.create({ data });
        res.status(201).json(nuevaEntidad);
    } catch (error) {
        console.error("❌ Error al crear entidad:", error);
        res.status(500).json({ error: "Error al crear entidad" });
    }
}

// ✅ Obtener todas las entidades
// ✅ Obtener entidades filtradas por tipo y origen
export async function getEntidades(req: Request, res: Response) {
    try {
        const { tipo, origen } = req.query;

        const where: any = {};

        // Filtro por tipo (EMPRESA / PERSONA)
        if (tipo === "EMPRESA" || tipo === "PERSONA") {
            where.tipo = tipo;
        }

        // Filtro por origen (RIDS / ECCONET / OTRO)
        if (origen === "RIDS" || origen === "ECCONET" || origen === "OTRO") {
            where.origen = origen;
        }

        const entidades = await prisma.entidadGestioo.findMany({
            where,
            orderBy: { id: "asc" },
            include: {
                productos: true,
            },
        });

        res.json(entidades);

    } catch (error) {
        console.error("❌ Error al obtener entidades:", error);
        res.status(500).json({ error: "Error al obtener entidades" });
    }
}

// ✅ Obtener una entidad por ID
export async function getEntidadById(req: Request, res: Response) {
    try {
        const id = Number(req.params.id);
        const entidad = await prisma.entidadGestioo.findUnique({
            where: { id },
            include: { productos: true },
        });
        if (!entidad) return res.status(404).json({ error: "Entidad no encontrada" });
        res.json(entidad);
    } catch (error) {
        console.error("❌ Error al obtener entidad:", error);
        res.status(500).json({ error: "Error al obtener entidad" });
    }
    return res.status(500).json({        // ✅ RETURN OBLIGATORIO
        error: "Error al obtener entidad",
    });
}

// ✅ Actualizar entidad
export async function updateEntidad(req: Request, res: Response) {
    try {
        const id = Number(req.params.id);
        const data = req.body;
        const entidadActualizada = await prisma.entidadGestioo.update({
            where: { id },
            data,
        });
        res.json(entidadActualizada);
    } catch (error) {
        console.error("❌ Error al actualizar entidad:", error);
        res.status(500).json({ error: "Error al actualizar entidad" });
    }
}

// ✅ Eliminar entidad
export async function deleteEntidad(req: Request, res: Response) {
    try {
        const id = Number(req.params.id);
        await prisma.entidadGestioo.delete({ where: { id } });
        res.json({ message: "✅ Entidad eliminada correctamente" });
    } catch (error) {
        console.error("❌ Error al eliminar entidad:", error);
        res.status(500).json({ error: "Error al eliminar entidad" });
    }
}
