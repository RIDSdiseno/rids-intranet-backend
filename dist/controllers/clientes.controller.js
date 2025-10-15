import { prisma } from "../lib/prisma.js";
import { z } from "zod";
/* ================== Schemas ================== */
const clienteSchema = z.object({
    nombre: z.string().min(1),
    email: z.string().email(),
    telefono: z.string(),
    empresaId: z.number().optional(),
    historiales: z
        .array(z.object({
        realizado: z.string().optional(),
        inicio: z.string(),
        fin: z.string(),
        tecnicoId: z.number(),
    }))
        .optional(),
    equipos: z
        .object({
        serial: z.string(),
        modelo: z.string(),
    })
        .optional(),
});
const clienteUpdateSchema = clienteSchema.partial();
/* ================== CRUD ================== */
// CREATE
export async function createCliente(req, res) {
    try {
        const { nombre, email, telefono, empresaId, historiales, equipos } = req.body;
        if (!nombre || !email) {
            return res.status(400).json({ error: "Faltan campos obligatorios: nombre o email" });
        }
        const data = {
            nombre,
            email,
            telefono,
            ...(empresaId && { empresa: { connect: { id_empresa: Number(empresaId) } } }),
            ...(historiales?.length && {
                historiales: {
                    create: historiales.map((h) => ({
                        realizado: h.realizado ?? null,
                        inicio: new Date(h.inicio),
                        fin: new Date(h.fin),
                        tecnicoId: Number(h.tecnicoId),
                    })),
                },
            }),
            ...(equipos && { equipos: { create: { serial: equipos.serial, modelo: equipos.modelo } } }),
        };
        const nuevoCliente = await prisma.solicitante.create({
            data,
            include: {
                empresa: true,
                historiales: true,
                equipos: true, // <-- incluye equipo en la respuesta
            },
        });
        return res.status(201).json(nuevoCliente);
    }
    catch (err) {
        console.error("Error al crear cliente extendido:", err);
        return res.status(500).json({ error: "Error al crear cliente extendido" });
    }
}
// READ ALL
export async function getClientes(req, res) {
    try {
        const clientes = await prisma.solicitante.findMany({
            orderBy: { id_solicitante: "asc" },
            include: {
                empresa: true,
                historiales: true,
                equipos: true,
            },
        });
        return res.status(200).json(clientes);
    }
    catch (err) {
        console.error("Error al obtener clientes:", err);
        return res.status(500).json({ error: "Error al obtener clientes" });
    }
}
// READ ONE
export async function getClienteById(req, res) {
    try {
        const id = Number(req.params.id);
        if (isNaN(id))
            return res.status(400).json({ error: "ID inválido" });
        const cliente = await prisma.solicitante.findUnique({
            where: { id_solicitante: id },
            include: {
                empresa: true,
                historiales: true,
                equipos: true,
            },
        });
        if (!cliente)
            return res.status(404).json({ error: "Cliente no encontrado" });
        return res.status(200).json(cliente);
    }
    catch (err) {
        console.error("Error al obtener cliente:", err);
        return res.status(500).json({ error: "Error al obtener cliente" });
    }
}
// UPDATE
export async function updateCliente(req, res) {
    try {
        const id = Number(req.params.id);
        if (isNaN(id))
            return res.status(400).json({ error: "ID inválido" });
        const { nombre, email, empresaId } = req.body;
        const data = {
            ...(nombre && { nombre }),
            ...(email && { email }),
            ...(empresaId && { empresa: { connect: { id_empresa: Number(empresaId) } } }),
        };
        const actualizado = await prisma.solicitante.update({
            where: { id_solicitante: id },
            data,
            include: {
                empresa: true,
                historiales: true,
                equipos: true,
            },
        });
        return res.status(200).json(actualizado);
    }
    catch (err) {
        console.error("Error al actualizar cliente:", err);
        if (err.code === "P2025")
            return res.status(404).json({ error: "Cliente no encontrado" });
        return res.status(500).json({ error: "Error al actualizar cliente" });
    }
}
// DELETE
export async function deleteCliente(req, res) {
    try {
        const id = Number(req.params.id);
        if (isNaN(id))
            return res.status(400).json({ error: "ID inválido" });
        await prisma.solicitante.delete({ where: { id_solicitante: id } });
        return res.status(204).send();
    }
    catch (err) {
        console.error("Error al eliminar cliente:", err);
        if (err.code === "P2025")
            return res.status(404).json({ error: "Cliente no encontrado" });
        return res.status(500).json({ error: "Error al eliminar cliente" });
    }
}
//# sourceMappingURL=clientes.controller.js.map