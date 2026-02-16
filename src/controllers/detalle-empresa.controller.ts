// src/controllers/detalle-empresa.controller.ts
import type { Request, Response } from "express";
import { prisma } from "../lib/prisma.js";
import { Prisma } from "@prisma/client";
import { z } from "zod";

/* ================== Schemas ================== */

const direccionItemSchema = z.object({
  tipo: z.string(),
  direccion: z.string(),
});

const detalleEmpresaSchema = z.object({
  rut: z.string(),
  direccion: z.string().optional(), // mantener temporalmente
  direcciones: z.array(direccionItemSchema).optional(), // 👈 nuevo
  telefono: z.string().optional(),
  email: z.string().email().nullable().optional(),
  empresa_id: z.number(),
});

const detalleEmpresaUpdateSchema = detalleEmpresaSchema.partial();

/* ================== CRUD ================== */

// CREATE
export async function createDetalleEmpresa(req: Request, res: Response) {
  try {
    const parsed = detalleEmpresaSchema.parse(req.body);

    const nuevo = await prisma.detalleEmpresa.create({
      data: {
        rut: parsed.rut,
        empresa_id: parsed.empresa_id,
        direccion: parsed.direccion ?? null,
        direcciones:
          parsed.direcciones !== undefined
            ? parsed.direcciones
            : Prisma.JsonNull,

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
  } catch (err: any) {
    console.error("Error al crear detalle empresa:", err);
    if (err.code === "P2002") return res.status(400).json({ error: "RUT ya existe" });
    if (err.code === "P2003") return res.status(400).json({ error: "Empresa no existe" });
    return res.status(500).json({ error: "Error al crear detalle empresa" });
  }
}

// READ ALL
export async function getDetallesEmpresa(_req: Request, res: Response) {
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
  } catch (err: any) {
    console.error("Error al obtener detalles empresa:", err);
    return res.status(500).json({ error: "Error al obtener detalles empresa" });
  }
}

// READ ONE BY ID
export async function getDetalleEmpresaById(req: Request, res: Response) {
  try {
    const id = Number(req.params.id);
    if (isNaN(id)) return res.status(400).json({ error: "ID inválido" });

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

    if (!detalle) return res.status(404).json({ error: "Detalle empresa no encontrado" });
    return res.status(200).json(detalle);
  } catch (err: any) {
    console.error("Error al obtener detalle empresa:", err);
    return res.status(500).json({ error: "Error al obtener detalle empresa" });
  }
}

// READ BY EMPRESA ID
export async function getDetalleEmpresaByEmpresaId(req: Request, res: Response) {
  try {
    const empresa_id = Number(req.params.empresa_id);
    if (isNaN(empresa_id)) return res.status(400).json({ error: "ID de empresa inválido" });

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

    if (!detalle) return res.status(404).json({ error: "Detalle empresa no encontrado" });
    return res.status(200).json(detalle);
  } catch (err: any) {
    console.error("Error al obtener detalle empresa:", err);
    return res.status(500).json({ error: "Error al obtener detalle empresa" });
  }
}

// UPDATE
export async function updateDetalleEmpresa(req: Request, res: Response) {
  try {
    const id = Number(req.params.id);
    if (isNaN(id)) return res.status(400).json({ error: "ID inválido" });

    const parsed = detalleEmpresaUpdateSchema.parse(req.body);

    const {
      empresa_id,
      rut,
      direccion,
      direcciones,
      telefono,
      email
    } = parsed;

    const data: Prisma.DetalleEmpresaUpdateInput = {};

    if (rut !== undefined) data.rut = rut;

    // 🔵 Dirección principal
    if (direccion !== undefined) {
      data.direccion = direccion ?? null;
    }

    // 🟢 Direcciones adicionales (JSON limpio)
    if (direcciones !== undefined) {
      const cleaned =
        Array.isArray(direcciones)
          ? direcciones.filter(d => d?.direccion?.trim())
          : [];

      data.direcciones =
        cleaned.length > 0
          ? (cleaned as Prisma.InputJsonValue)
          : Prisma.JsonNull;
    }

    if (telefono !== undefined) data.telefono = telefono ?? null;
    if (email !== undefined) data.email = email ?? null;

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

  } catch (err: any) {
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
export async function deleteDetalleEmpresa(req: Request, res: Response) {
  try {
    const id = Number(req.params.id);
    if (isNaN(id)) return res.status(400).json({ error: "ID inválido" });

    await prisma.detalleEmpresa.delete({ where: { id } });
    return res.status(204).send();
  } catch (err: any) {
    console.error("Error al eliminar detalle empresa:", err);
    if (err.code === "P2025") return res.status(404).json({ error: "Detalle empresa no encontrado" });
    return res.status(500).json({ error: "Error al eliminar detalle empresa" });
  }
}
