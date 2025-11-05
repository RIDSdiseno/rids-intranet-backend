import { prisma } from "../lib/prisma.js";
import { z } from "zod";
/* ================== Schemas ================== */
const detalleEmpresaSchema = z.object({
    rut: z.string(),
    direccion: z.string(),
    telefono: z.string(),
    email: z.string().email(),
    empresa_id: z.number(),
});
const detalleEmpresaUpdateSchema = detalleEmpresaSchema.partial();
/* ================== CRUD ================== */
// CREATE
export async function createDetalleEmpresa(req, res) {
    try {
        const data = detalleEmpresaSchema.parse(req.body);
        const nuevo = await prisma.detalle_empresas.create({
            data,
            include: {
                empresa: {
                    select: {
                        id_empresa: true,
                        nombre: true,
                    },
                },
            },
        });
        return res.status(201).json(nuevo);
    }
    catch (err) {
        console.error("Error al crear detalle empresa:", err);
        if (err.code === "P2002")
            return res.status(400).json({ error: "RUT ya existe" });
        if (err.code === "P2003")
            return res.status(400).json({ error: "Empresa no existe" });
        return res.status(500).json({ error: "Error al crear detalle empresa" });
    }
}
// READ ALL
export async function getDetallesEmpresa(_req, res) {
    try {
        const detalles = await prisma.detalle_empresas.findMany({
            include: {
                empresa: {
                    select: {
                        id_empresa: true,
                        nombre: true,
                    },
                },
            },
            orderBy: { id: "asc" },
        });
        return res.status(200).json(detalles);
    }
    catch (err) {
        console.error("Error al obtener detalles empresa:", err);
        return res.status(500).json({ error: "Error al obtener detalles empresa" });
    }
}
// READ ONE BY ID
export async function getDetalleEmpresaById(req, res) {
    try {
        const id = Number(req.params.id);
        if (isNaN(id))
            return res.status(400).json({ error: "ID inválido" });
        const detalle = await prisma.detalle_empresas.findUnique({
            where: { id },
            include: {
                empresa: {
                    select: {
                        id_empresa: true,
                        nombre: true,
                    },
                },
            },
        });
        if (!detalle)
            return res.status(404).json({ error: "Detalle empresa no encontrado" });
        return res.status(200).json(detalle);
    }
    catch (err) {
        console.error("Error al obtener detalle empresa:", err);
        return res.status(500).json({ error: "Error al obtener detalle empresa" });
    }
}
// READ BY EMPRESA ID
export async function getDetalleEmpresaByEmpresaId(req, res) {
    try {
        const empresa_id = Number(req.params.empresa_id);
        if (isNaN(empresa_id))
            return res.status(400).json({ error: "ID de empresa inválido" });
        const detalle = await prisma.detalle_empresas.findUnique({
            where: { empresa_id },
            include: {
                empresa: {
                    select: {
                        id_empresa: true,
                        nombre: true,
                    },
                },
            },
        });
        if (!detalle)
            return res.status(404).json({ error: "Detalle empresa no encontrado" });
        return res.status(200).json(detalle);
    }
    catch (err) {
        console.error("Error al obtener detalle empresa:", err);
        return res.status(500).json({ error: "Error al obtener detalle empresa" });
    }
}
// UPDATE
// UPDATE
export async function updateDetalleEmpresa(req, res) {
    try {
        const id = Number(req.params.id);
        if (isNaN(id))
            return res.status(400).json({ error: "ID inválido" });
        const parsed = detalleEmpresaUpdateSchema.parse(req.body);
        // separar empresa_id del resto
        const { empresa_id, rut, direccion, telefono, email } = parsed;
        // construir data con operaciones { set } para evitar conflictos de tipos
        const data = {};
        if (rut !== undefined)
            data.rut = { set: rut };
        if (direccion !== undefined)
            data.direccion = { set: direccion };
        if (telefono !== undefined)
            data.telefono = { set: telefono };
        if (email !== undefined)
            data.email = { set: email };
        // si se desea cambiar la empresa, usar el campo relacional
        if (empresa_id !== undefined) {
            data.empresa = { connect: { id_empresa: empresa_id } };
            // ⚠️ NO enviar empresa_id directamente en `data`
        }
        const actualizado = await prisma.detalle_empresas.update({
            where: { id },
            data,
            include: {
                empresa: {
                    select: { id_empresa: true, nombre: true },
                },
            },
        });
        return res.status(200).json(actualizado);
    }
    catch (err) {
        console.error("Error al actualizar detalle empresa:", err);
        if (err.code === "P2002")
            return res.status(400).json({ error: "RUT ya existe" });
        if (err.code === "P2003")
            return res.status(400).json({ error: "Empresa no existe" });
        if (err.code === "P2025")
            return res.status(404).json({ error: "Detalle empresa no encontrado" });
        return res.status(500).json({ error: "Error al actualizar detalle empresa" });
    }
}
// DELETE
export async function deleteDetalleEmpresa(req, res) {
    try {
        const id = Number(req.params.id);
        if (isNaN(id))
            return res.status(400).json({ error: "ID inválido" });
        await prisma.detalle_empresas.delete({ where: { id } });
        return res.status(204).send();
    }
    catch (err) {
        console.error("Error al eliminar detalle empresa:", err);
        if (err.code === "P2025")
            return res.status(404).json({ error: "Detalle empresa no encontrado" });
        return res.status(500).json({ error: "Error al eliminar detalle empresa" });
    }
}
//# sourceMappingURL=detalle-empresa.controller.js.map