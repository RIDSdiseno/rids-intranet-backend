import fs from "fs/promises";
import path from "path";
import { PrismaClient, TipoEntidadGestioo, OrigenGestioo } from "@prisma/client";
const prisma = new PrismaClient();
/* =====================================================
   SEED RIDS
===================================================== */
export async function seedEntidadesRIDS(_req, res) {
    try {
        const filePath = path.resolve("prisma/entidades_rids_seed.json");
        const fileContent = await fs.readFile(filePath, "utf8");
        const entidadesRIDS = JSON.parse(fileContent);
        const data = entidadesRIDS.map((e) => ({
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
        return res.status(201).json({
            data: {
                inserted: result.count,
                message: `Se insertaron ${result.count} entidades RIDS.`,
            },
        });
    }
    catch (error) {
        console.error("❌ Error seed RIDS:", error);
        return res.status(500).json({
            error: "Error al poblar entidades RIDS",
            detalles: error.message,
        });
    }
}
/* =====================================================
   SEED ECONNET
===================================================== */
export async function seedEntidadesECONNET(_req, res) {
    try {
        const filePath = path.resolve("prisma/entidades_econnet_seed.json");
        const fileContent = await fs.readFile(filePath, "utf8");
        const entidadesECONNET = JSON.parse(fileContent);
        const data = entidadesECONNET.map((e) => ({
            nombre: e.nombre,
            rut: e.rut,
            correo: e.correo,
            telefono: e.telefono,
            direccion: e.direccion,
            tipo: TipoEntidadGestioo.EMPRESA,
            origen: OrigenGestioo.ECONNET,
        }));
        const result = await prisma.entidadGestioo.createMany({
            data,
            skipDuplicates: true,
        });
        return res.status(201).json({
            data: {
                inserted: result.count,
                message: `Se insertaron ${result.count} entidades ECONNET.`,
            },
        });
    }
    catch (error) {
        console.error("❌ Error seed ECONNET:", error);
        return res.status(500).json({
            error: "Error al poblar entidades ECONNET",
            detalles: error.message,
        });
    }
}
/* =====================================================
   CRUD ENTIDADES
===================================================== */
// Crear entidad
export async function createEntidad(req, res) {
    try {
        const data = req.body;
        const nuevaEntidad = await prisma.entidadGestioo.create({ data });
        return res.status(201).json({ data: nuevaEntidad });
    }
    catch (error) {
        console.error("❌ Error al crear entidad:", error);
        return res.status(500).json({ error: "Error al crear entidad" });
    }
}
// Obtener todas
export async function getEntidades(req, res) {
    try {
        const { tipo, origen } = req.query;
        const where = {};
        if (tipo === "EMPRESA" || tipo === "PERSONA")
            where.tipo = tipo;
        if (origen === "RIDS" || origen === "ECONNET" || origen === "OTRO")
            where.origen = origen;
        const entidades = await prisma.entidadGestioo.findMany({
            where,
            orderBy: { id: "asc" },
            include: { productos: true },
        });
        return res.json({ data: entidades });
    }
    catch (error) {
        console.error("❌ Error al obtener entidades:", error);
        return res.status(500).json({ error: "Error al obtener entidades" });
    }
}
// Obtener por ID
export async function getEntidadById(req, res) {
    try {
        const id = Number(req.params.id);
        const entidad = await prisma.entidadGestioo.findUnique({
            where: { id },
            include: { productos: true },
        });
        if (!entidad) {
            return res.status(404).json({ error: "Entidad no encontrada" });
        }
        return res.json({ data: entidad });
    }
    catch (error) {
        console.error("❌ Error al obtener entidad:", error);
        return res.status(500).json({ error: "Error al obtener entidad" });
    }
}
// Actualizar
export async function updateEntidad(req, res) {
    try {
        const id = Number(req.params.id);
        const data = req.body;
        const entidadActualizada = await prisma.entidadGestioo.update({
            where: { id },
            data,
        });
        return res.json({ data: entidadActualizada });
    }
    catch (error) {
        console.error("❌ Error al actualizar entidad:", error);
        return res.status(500).json({ error: "Error al actualizar entidad" });
    }
}
// Eliminar
export async function deleteEntidad(req, res) {
    try {
        const id = Number(req.params.id);
        await prisma.entidadGestioo.delete({ where: { id } });
        return res.json({ message: "Entidad eliminada correctamente" });
    }
    catch (error) {
        console.error("❌ Error al eliminar entidad:", error);
        return res.status(500).json({ error: "Error al eliminar entidad" });
    }
}
//# sourceMappingURL=entidades.controller.js.map