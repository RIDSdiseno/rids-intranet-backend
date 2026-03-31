import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();
/* =====================================================
   CRUD: MARCAGESTIOO
===================================================== */
// ✅ Crear marca
export async function createMarca(req, res) {
    try {
        const data = req.body;
        const dataMarca = {
            nombre: data.nombre,
            ...(data.modelos?.length && {
                modelos: {
                    create: data.modelos.map((m) => ({
                        nombre: m.nombre,
                    })),
                },
            }),
        };
        const nuevaMarca = await prisma.marcaGestioo.create({
            data: dataMarca,
            include: { modelos: true },
        });
        res.status(201).json(nuevaMarca);
    }
    catch (error) {
        console.error("❌ Error al crear marca:", error);
        res.status(500).json({ error: "Error al crear marca" });
    }
}
// ✅ Obtener todas las marcas con sus modelos
export async function getMarcas(_req, res) {
    try {
        const marcas = await prisma.marcaGestioo.findMany({
            orderBy: { id: "asc" },
            include: { modelos: true },
        });
        res.json(marcas);
    }
    catch (error) {
        console.error("❌ Error al obtener marcas:", error);
        res.status(500).json({ error: "Error al obtener marcas" });
    }
}
// ✅ Obtener marca por ID
export async function getMarcaById(req, res) {
    try {
        const id = Number(req.params.id);
        const marca = await prisma.marcaGestioo.findUnique({
            where: { id },
            include: { modelos: true },
        });
        if (!marca)
            return res.status(404).json({ error: "Marca no encontrada" });
        res.json(marca);
    }
    catch (error) {
        console.error("❌ Error al obtener marca:", error);
        res.status(500).json({ error: "Error al obtener marca" });
    }
    return res.status(500).json({
        error: "Error al obtener marca",
    });
}
// ✅ Actualizar marca (solo nombre o modelos nuevos)
export async function updateMarca(req, res) {
    try {
        const id = Number(req.params.id);
        const data = req.body;
        const dataMarca = {
            nombre: data.nombre,
            ...(data.modelos?.length && {
                modelos: {
                    create: data.modelos.map((m) => ({
                        nombre: m.nombre,
                    })),
                },
            }),
        };
        const marcaActualizada = await prisma.marcaGestioo.update({
            where: { id },
            data: dataMarca,
            include: { modelos: true },
        });
        res.json(marcaActualizada);
    }
    catch (error) {
        console.error("❌ Error al actualizar marca:", error);
        res.status(500).json({ error: "Error al actualizar marca" });
    }
}
// ✅ Eliminar marca y sus modelos asociados
export async function deleteMarca(req, res) {
    try {
        const id = Number(req.params.id);
        await prisma.modeloGestioo.deleteMany({ where: { marcaId: id } });
        await prisma.marcaGestioo.delete({ where: { id } });
        res.json({ message: "✅ Marca y modelos asociados eliminados correctamente" });
    }
    catch (error) {
        console.error("❌ Error al eliminar marca:", error);
        res.status(500).json({ error: "Error al eliminar marca" });
    }
}
//# sourceMappingURL=marcas-gestioo.controller.js.map