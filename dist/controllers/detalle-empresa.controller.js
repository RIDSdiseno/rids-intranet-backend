import { prisma } from "../lib/prisma.js";
import { z } from "zod";
/* ================== Schemas ================== */
const detalleEmpresaSchema = z.object({
    rut: z.string(),
    direccion: z.string().optional(),
    telefono: z.string().optional(),
    email: z.string().email().nullable().optional(),
    empresa_id: z.number(),
});
const detalleEmpresaUpdateSchema = detalleEmpresaSchema.partial();
/* ================== CRUD ================== */
// CREATE
export async function createDetalleEmpresa(req, res) {
    try {
        const parsed = detalleEmpresaSchema.parse(req.body);
        const nuevo = await prisma.detalleEmpresa.create({
            data: {
                rut: parsed.rut,
                empresa_id: parsed.empresa_id,
                direccion: parsed.direccion ?? null,
                telefono: parsed.telefono ?? null,
                email: parsed.email ?? null,
            },
            include: {
                empresa: {
                    select: { id_empresa: true, nombre: true },
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
        const detalles = await prisma.detalleEmpresa.findMany({
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
        const detalle = await prisma.detalleEmpresa.findUnique({
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
        const detalle = await prisma.detalleEmpresa.findUnique({
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
export async function updateDetalleEmpresa(req, res) {
    try {
        const id = Number(req.params.id);
        if (isNaN(id))
            return res.status(400).json({ error: "ID inválido" });
        const parsed = detalleEmpresaUpdateSchema.parse(req.body);
        const { empresa_id, rut, direccion, telefono, email } = parsed;
        const data = {};
        if (rut !== undefined)
            data.rut = rut;
        if (direccion !== undefined)
            data.direccion = direccion ?? null;
        if (telefono !== undefined)
            data.telefono = telefono ?? null;
        if (email !== undefined)
            data.email = email ?? null;
        if (empresa_id !== undefined) {
            data.empresa = { connect: { id_empresa: empresa_id } };
        }
        const actualizado = await prisma.detalleEmpresa.update({
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
        await prisma.detalleEmpresa.delete({ where: { id } });
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