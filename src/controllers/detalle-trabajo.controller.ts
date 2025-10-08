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
    notas: z.string().optional().nullable()
});

const detalleTrabajoUpdateSchema = detalleTrabajoSchema.partial();

/* ================== CRUD ================== */

// CREATE
// CREATE - Versión mejorada y más limpia
export async function createDetalleTrabajo(req: Request, res: Response) {
    try {
        const data = detalleTrabajoSchema.parse(req.body);

        const nuevo = await prisma.detalleTrabajo.create({
            data: {
                fecha_ingreso: new Date(data.fecha_ingreso),
                fecha_egreso: data.fecha_egreso ? new Date(data.fecha_egreso) : null,
                trabajo: data.trabajo,
                prioridad: data.prioridad,
                estado: data.estado,
                accesorios: data.accesorios ?? null,
                notas: data.notas ?? null,
            }
        });

        return res.status(201).json(nuevo);
    } catch (err: any) {
        console.error("Error al crear detalle trabajo:", err);
        return res.status(500).json({ error: "Error al crear detalle trabajo" });
    }
}

// READ ALL
export async function getDetallesTrabajo(req: Request, res: Response) {
    try {
        const detalles = await prisma.detalleTrabajo.findMany({
            orderBy: { id: "asc" }
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

        const detalle = await prisma.detalleTrabajo.findUnique({
            where: { id }
        });

        if (!detalle) return res.status(404).json({ error: "Detalle trabajo no encontrado" });
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

        const parsedData = detalleTrabajoUpdateSchema.parse(req.body);

        // Preparar los datos para actualizar, manejando las fechas
        const data: any = {};

        if (parsedData.fecha_ingreso !== undefined) {
            data.fecha_ingreso = new Date(parsedData.fecha_ingreso);
        }
        if (parsedData.fecha_egreso !== undefined) {
            data.fecha_egreso = parsedData.fecha_egreso ? new Date(parsedData.fecha_egreso) : null;
        }
        if (parsedData.trabajo !== undefined) data.trabajo = parsedData.trabajo;
        if (parsedData.accesorios !== undefined) data.accesorios = parsedData.accesorios;
        if (parsedData.prioridad !== undefined) data.prioridad = parsedData.prioridad;
        if (parsedData.estado !== undefined) data.estado = parsedData.estado;
        if (parsedData.notas !== undefined) data.notas = parsedData.notas;

        const actualizado = await prisma.detalleTrabajo.update({
            where: { id },
            data
        });

        return res.status(200).json(actualizado);
    } catch (err: any) {
        console.error("Error al actualizar detalle trabajo:", err);
        if (err.code === "P2025") return res.status(404).json({ error: "Detalle trabajo no encontrado" });
        return res.status(500).json({ error: "Error al actualizar detalle trabajo" });
    }
}

// DELETE
export async function deleteDetalleTrabajo(req: Request, res: Response) {
    try {
        const id = Number(req.params.id);
        if (isNaN(id)) return res.status(400).json({ error: "ID inválido" });

        await prisma.detalleTrabajo.delete({ where: { id } });
        return res.status(204).send();
    } catch (err: any) {
        console.error("Error al eliminar detalle trabajo:", err);
        if (err.code === "P2025") return res.status(404).json({ error: "Detalle trabajo no encontrado" });
        return res.status(500).json({ error: "Error al eliminar detalle trabajo" });
    }
}