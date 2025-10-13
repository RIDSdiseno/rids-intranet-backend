import type { Request, Response } from "express";
import { prisma } from "../lib/prisma.js";
import { z } from "zod";

/* ================== Schemas ================== */

const clienteSchema = z.object({
  rut: z.string(),
  nombre: z.string(),
  direccion: z.string(),
  telefono: z.string(),
  email: z.string().email()
});

const clienteUpdateSchema = clienteSchema.partial();

/* ================== CRUD ================== */

// CREATE

export async function createCliente(req: Request, res: Response) {
  try {
    const data = clienteSchema.parse(req.body);
    const nuevo = await prisma.cliente.create({ data });
    return res.status(201).json(nuevo);
  } catch (err: any) {
    console.error("Error al crear cliente:", err);
    if (err.code === "P2002") return res.status(400).json({ error: "RUT o email ya existe" });
    return res.status(500).json({ error: "Error al crear cliente" });
  }
}

//  READ ALL
export async function getClientes(req: Request, res: Response) {
  try {
    const clientes = await prisma.solicitante.findMany({
      orderBy: { id_solicitante: "asc" },
      select: {
        nombre: true,
        email: true,
        empresa: {
          select: {
            nombre: true
          }
        },
        historiales: {
          select: {
            id_historial: true,
            realizado: true,
            inicio: true,
            fin: true
          }
        }
      }
    });

    // Formatea el resultado para que se vea como "clientes"
    const resultado = clientes.map(c => ({
      nombre: c.nombre,
      email: c.email,
      empresa: c.empresa?.nombre ?? null,
      historiales: c.historiales
    }));

    return res.status(200).json(resultado);
  } catch (err: any) {
    console.error("Error al obtener clientes:", err);
    return res.status(500).json({ error: "Error al obtener clientes" });
  }
}

// READ ONE
export async function getClienteById(req: Request, res: Response) {
  try {
    const id = Number(req.params.id);
    if (isNaN(id)) return res.status(400).json({ error: "ID inválido" });

    const cliente = await prisma.solicitante.findUnique({
      where: { id_solicitante: id },
      select: {
        nombre: true,
        email: true,
        empresa: {
          select: {
            nombre: true
          }
        },
        historiales: {
          select: {
            id_historial: true,
            realizado: true,
            inicio: true,
            fin: true
          }
        }
      }
    });

    if (!cliente) return res.status(404).json({ error: "Cliente no encontrado" });

    // Formatear la respuesta igual que en getClientes
    const resultado = {
      nombre: cliente.nombre,
      email: cliente.email,
      empresa: cliente.empresa?.nombre ?? null,
      historiales: cliente.historiales
    };

    return res.status(200).json(resultado);
  } catch (err: any) {
    console.error("Error al obtener cliente:", err);
    return res.status(500).json({ error: "Error al obtener cliente" });
  }
}


//  UPDATE
export async function updateCliente(req: Request, res: Response) {
  try {
    const id = Number(req.params.id);
    if (isNaN(id)) return res.status(400).json({ error: "ID inválido" });

    const parsedData = clienteUpdateSchema.parse(req.body);

    // Convierte los campos definidos a formato Prisma { set: value }
    const data = Object.fromEntries(
      Object.entries(parsedData)
        .filter(([_, v]) => v !== undefined)
        .map(([k, v]) => [k, { set: v }])
    );

    const actualizado = await prisma.cliente.update({ where: { id }, data });
    return res.status(200).json(actualizado);
  } catch (err: any) {
    console.error("Error al actualizar cliente:", err);
    if (err.code === "P2002") return res.status(400).json({ error: "RUT o email ya existe" });
    if (err.code === "P2025") return res.status(404).json({ error: "Cliente no encontrado" });
    return res.status(500).json({ error: "Error al actualizar cliente" });
  }
}

//  DELETE
export async function deleteCliente(req: Request, res: Response) {
  try {
    const id = Number(req.params.id);
    if (isNaN(id)) return res.status(400).json({ error: "ID inválido" });

    await prisma.cliente.delete({ where: { id } });
    return res.status(204).send();
  } catch (err: any) {
    console.error("Error al eliminar cliente:", err);
    if (err.code === "P2025") return res.status(404).json({ error: "Cliente no encontrado" });
    return res.status(500).json({ error: "Error al eliminar cliente" });
  }
}