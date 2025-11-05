// src/controllers/detalle-trabajo.controller.ts
import type { Request, Response } from "express";
import { prisma } from "../lib/prisma.js";
import { z } from "zod";

/* ================== Schemas ================== */
const detalleTrabajoSchema = z.object({
  fecha_ingreso: z.string().datetime(),
  fecha_egreso: z.string().datetime().optional().nullable(),
  trabajo: z.string(),
  accesorios: z.string().optional().nullable(),
  prioridad: z.enum(["baja", "normal", "alta"]),
  estado: z.string(),
  notas: z.string().optional().nullable(),
  empresa_id: z.number(),
  equipo_id: z.number(),
  tecnico_id: z.number(),
});

const detalleTrabajoUpdateSchema = detalleTrabajoSchema.partial();

/* ================== CRUD ================== */

// CREATE
export async function createDetalleTrabajo(req: Request, res: Response) {
  try {
    const data = detalleTrabajoSchema.parse(req.body);

    const nuevo = await prisma.detalle_trabajos.create({
      data: {
        fecha_ingreso: new Date(data.fecha_ingreso),
        fecha_egreso: data.fecha_egreso ? new Date(data.fecha_egreso) : null,
        trabajo: data.trabajo,
        accesorios: data.accesorios ?? null,
        prioridad: data.prioridad,
        estado: data.estado,
        notas: data.notas ?? null,
        empresa_id: data.empresa_id,
        equipo_id: data.equipo_id,
        tecnico_id: data.tecnico_id,
      },
    });

    return res.status(201).json(nuevo);
  } catch (err: any) {
    console.error("Error al crear detalle trabajo:", err);
    if (err.code === "P2003") {
      return res
        .status(400)
        .json({ error: "Empresa, equipo o técnico no existen" });
    }
    return res.status(500).json({ error: "Error al crear detalle trabajo" });
  }
}

// READ ALL
export async function getDetallesTrabajo(_req: Request, res: Response) {
  try {
    const detalles = await prisma.detalle_trabajos.findMany({
      orderBy: { id: "asc" },
    });
    return res.status(200).json(detalles);
  } catch (err: any) {
    console.error("Error al obtener detalles trabajo:", err);
    return res.status(500).json({ error: "Error al obtener detalles trabajo" });
  }
}

// READ ONE BY ID
export async function getDetalleTrabajoById(req: Request, res: Response) {
  try {
    const id = Number(req.params.id);
    if (isNaN(id)) return res.status(400).json({ error: "ID inválido" });

    const detalle = await prisma.detalle_trabajos.findUnique({ where: { id } });
    if (!detalle)
      return res.status(404).json({ error: "Detalle trabajo no encontrado" });

    return res.status(200).json(detalle);
  } catch (err: any) {
    console.error("Error al obtener detalle trabajo:", err);
    return res.status(500).json({ error: "Error al obtener detalle trabajo" });
  }
}

// UPDATE
export async function updateDetalleTrabajo(req: Request, res: Response) {
  try {
    const id = Number(req.params.id);
    if (isNaN(id)) return res.status(400).json({ error: "ID inválido" });

    const parsed = detalleTrabajoUpdateSchema.parse(req.body);

    const data: any = {};
    if (parsed.fecha_ingreso !== undefined)
      data.fecha_ingreso = new Date(parsed.fecha_ingreso);
    if (parsed.fecha_egreso !== undefined)
      data.fecha_egreso = parsed.fecha_egreso
        ? new Date(parsed.fecha_egreso)
        : null;
    if (parsed.trabajo !== undefined) data.trabajo = parsed.trabajo;
    if (parsed.accesorios !== undefined)
      data.accesorios = parsed.accesorios ?? null;
    if (parsed.prioridad !== undefined) data.prioridad = parsed.prioridad;
    if (parsed.estado !== undefined) data.estado = parsed.estado;
    if (parsed.notas !== undefined) data.notas = parsed.notas ?? null;
    if (parsed.empresa_id !== undefined) data.empresa_id = parsed.empresa_id;
    if (parsed.equipo_id !== undefined) data.equipo_id = parsed.equipo_id;
    if (parsed.tecnico_id !== undefined) data.tecnico_id = parsed.tecnico_id;

    const actualizado = await prisma.detalle_trabajos.update({
      where: { id },
      data,
    });

    return res.status(200).json(actualizado);
  } catch (err: any) {
    console.error("Error al actualizar detalle trabajo:", err);
    if (err.code === "P2025")
      return res
        .status(404)
        .json({ error: "Detalle trabajo no encontrado" });
    if (err.code === "P2003")
      return res
        .status(400)
        .json({ error: "Empresa, equipo o técnico no existen" });
    return res.status(500).json({ error: "Error al actualizar detalle trabajo" });
  }
}

// DELETE
export async function deleteDetalleTrabajo(req: Request, res: Response) {
  try {
    const id = Number(req.params.id);
    if (isNaN(id)) return res.status(400).json({ error: "ID inválido" });

    await prisma.detalle_trabajos.delete({ where: { id } });
    return res.status(204).send();
  } catch (err: any) {
    console.error("Error al eliminar detalle trabajo:", err);
    if (err.code === "P2025")
      return res
        .status(404)
        .json({ error: "Detalle trabajo no encontrado" });
    return res.status(500).json({ error: "Error al eliminar detalle trabajo" });
  }
}
