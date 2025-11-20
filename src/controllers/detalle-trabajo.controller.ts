// src/controllers/detalle-empresa.controller.ts
import type { Request, Response } from "express";
import { prisma } from "../lib/prisma.js";
import { z } from "zod";

/* ================== Schemas ================== */
const detalleTrabajoSchema = z.object({
  fecha_ingreso: z.string().datetime(),
  fecha_egreso: z.string().datetime().optional().nullable(),
  fecha_prometida: z.string().datetime().optional().nullable(),
  trabajo: z.string(),
  accesorios: z.string().optional().nullable(),
  area: z.enum(["entrada", "domicilio", "reparacion", "salida"]).default("entrada"),
  diagnostico: z.boolean().optional().default(false),
  garantia: z.boolean().optional().default(false),
  contrasena: z.string().optional().nullable(),
  presupuesto: z.number().optional().nullable(),
  adelanto: z.number().optional().nullable(),
  prioridad: z.enum(["baja", "normal", "alta"]),
  estado: z.string(),
  notas: z.string().optional().nullable(),
  empresa_id: z.number().optional().nullable(),
  equipo_id: z.number().optional().nullable(),
  tecnico_id: z.number().optional().nullable(),
});

const detalleTrabajoUpdateSchema = detalleTrabajoSchema.partial();

/* ================== CREATE ================== */
export async function createDetalleTrabajo(req: Request, res: Response) {
    try {
        const data = detalleTrabajoSchema.parse(req.body);

    const nuevo = await prisma.detalleTrabajo.create({
      data: {
        fecha_ingreso: new Date(data.fecha_ingreso),
        fecha_egreso: data.fecha_egreso ? new Date(data.fecha_egreso) : null,
        fecha_prometida: data.fecha_prometida ? new Date(data.fecha_prometida) : null,
        trabajo: data.trabajo,
        accesorios: data.accesorios ?? null,
        diagnostico: data.diagnostico ?? false,
        garantia: data.garantia ?? false,
        contrasena: data.contrasena ?? null,
        presupuesto: data.presupuesto ?? null,
        adelanto: data.adelanto ?? null,
        prioridad: data.prioridad,
        estado: data.estado,
        notas: data.notas ?? null,
        area: data.area,
        empresa_id: data.empresa_id ?? null,
        equipo_id: data.equipo_id ?? null,
        tecnico_id: data.tecnico_id ?? null,
      },
      include: {
        empresa: {
          select: {
            id_empresa: true,
            nombre: true,
            detalleEmpresa: { select: { telefono: true, email: true } },
          },
        },
        equipo: {
          select: { id_equipo: true, serial: true, marca: true, modelo: true },
        },
        tecnico: { select: { id_tecnico: true, nombre: true } },
      },
    });

    return res.status(201).json(nuevo);
  } catch (err: any) {
    console.error("Error al crear detalle trabajo:", err);
    if (err.code === "P2003") {
      return res.status(400).json({ error: "Empresa, equipo o técnico no existen" });
    }
    return res.status(500).json({ error: "Error al crear detalle trabajo" });
  }
}

/* ================== READ ALL ================== */
export async function getDetallesTrabajo(_req: Request, res: Response) {
  try {
    const detalles = await prisma.detalleTrabajo.findMany({
      include: {
        empresa: {
          select: {
            id_empresa: true,
            nombre: true,
            detalleEmpresa: { select: { telefono: true, email: true } },
          },
        },
        equipo: {
          select: { id_equipo: true, serial: true, marca: true, modelo: true },
        },
        tecnico: { select: { id_tecnico: true, nombre: true } },
      },
      orderBy: { id: "asc" },
    });
    return res.status(200).json(detalles);
  } catch (err: any) {
    console.error("Error al obtener detalles trabajo:", err);
    return res.status(500).json({ error: "Error al obtener detalles trabajo" });
  }
}

/* ================== READ ONE ================== */
export async function getDetalleTrabajoById(req: Request, res: Response) {
    try {
        const id = Number(req.params.id);
        if (isNaN(id)) return res.status(400).json({ error: "ID inválido" });

    const detalle = await prisma.detalleTrabajo.findUnique({
      where: { id },
      include: {
        empresa: {
          select: {
            id_empresa: true,
            nombre: true,
            detalleEmpresa: { select: { telefono: true, email: true } },
          },
        },
        equipo: {
          select: { id_equipo: true, serial: true, marca: true, modelo: true },
        },
        tecnico: { select: { id_tecnico: true, nombre: true } },
      },
    });

    if (!detalle) {
      return res.status(404).json({ error: "Detalle trabajo no encontrado" });
    }
    return res.status(200).json(detalle);
  } catch (err: any) {
    console.error("Error al obtener detalle trabajo:", err);
    return res.status(500).json({ error: "Error al obtener detalle trabajo" });
  }
}

/* ================== UPDATE ================== */
export async function updateDetalleTrabajo(req: Request, res: Response) {
    try {
        const id = Number(req.params.id);
        if (isNaN(id)) return res.status(400).json({ error: "ID inválido" });

    const parsed = detalleTrabajoUpdateSchema.parse(req.body);
    const data: any = {};

    if (parsed.fecha_ingreso !== undefined)
      data.fecha_ingreso = new Date(parsed.fecha_ingreso);
    if (parsed.fecha_egreso !== undefined)
      data.fecha_egreso = parsed.fecha_egreso ? new Date(parsed.fecha_egreso) : null;
    if (parsed.fecha_prometida !== undefined)
      data.fecha_prometida = parsed.fecha_prometida
        ? new Date(parsed.fecha_prometida)
        : null;

    if (parsed.trabajo !== undefined) data.trabajo = parsed.trabajo;
    if (parsed.accesorios !== undefined) data.accesorios = parsed.accesorios ?? null;
    if (parsed.diagnostico !== undefined) data.diagnostico = parsed.diagnostico;
    if (parsed.garantia !== undefined) data.garantia = parsed.garantia;
    if (parsed.contrasena !== undefined) data.contrasena = parsed.contrasena ?? null;
    if (parsed.presupuesto !== undefined) data.presupuesto = parsed.presupuesto ?? null;
    if (parsed.adelanto !== undefined) data.adelanto = parsed.adelanto ?? null;
    if (parsed.prioridad !== undefined) data.prioridad = parsed.prioridad;
    if (parsed.estado !== undefined) data.estado = parsed.estado;
    if (parsed.notas !== undefined) data.notas = parsed.notas ?? null;
    if (parsed.area !== undefined) data.area = parsed.area;
    if (parsed.empresa_id !== undefined) data.empresa_id = parsed.empresa_id;
    if (parsed.equipo_id !== undefined) data.equipo_id = parsed.equipo_id;
    if (parsed.tecnico_id !== undefined) data.tecnico_id = parsed.tecnico_id;

    const actualizado = await prisma.detalleTrabajo.update({
      where: { id },
      data,
      include: {
        empresa: {
          select: {
            id_empresa: true,
            nombre: true,
            detalleEmpresa: { select: { telefono: true, email: true } },
          },
        },
        equipo: {
          select: { id_equipo: true, serial: true, marca: true, modelo: true },
        },
        tecnico: { select: { id_tecnico: true, nombre: true } },
      },
    });

    return res.status(200).json(actualizado);
  } catch (err: any) {
    console.error("Error al actualizar detalle trabajo:", err);
    if (err.code === "P2025") {
      return res.status(404).json({ error: "Detalle trabajo no encontrado" });
    }
    return res.status(500).json({ error: "Error al actualizar detalle trabajo" });
  }
}

/* ================== DELETE ================== */
export async function deleteDetalleTrabajo(req: Request, res: Response) {
    try {
        const id = Number(req.params.id);
        if (isNaN(id)) return res.status(400).json({ error: "ID inválido" });

    await prisma.detalleTrabajo.delete({ where: { id } });
    return res.status(204).send();
  } catch (err: any) {
    console.error("Error al eliminar detalle trabajo:", err);
    if (err.code === "P2025") {
      return res.status(404).json({ error: "Detalle trabajo no encontrado" });
    }
    return res.status(500).json({ error: "Error al eliminar detalle trabajo" });
  }
}
