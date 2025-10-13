// src/controllers/equipos.controller.ts
import type { Request, Response } from "express";
import type { Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma.js";
import { z } from "zod";

/* ================== Schemas ================== */

const listQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(200).default(20),

  // filtros
  search: z.string().trim().optional(), // busca en serial/marca/modelo/procesador/solicitante/empresa
  marca: z.string().trim().optional(),
  empresaId: z.coerce.number().int().optional(),
  solicitanteId: z.coerce.number().int().optional(),

  // orden
  sortBy: z
    .enum([
      "id_equipo",
      "serial",
      "marca",
      "modelo",
      "procesador",
      "ram",
      "disco",
      "propiedad",
      "empresa",
      "solicitante",
    ])
    .default("id_equipo")
    .optional(),
  sortDir: z.enum(["asc", "desc"]).default("desc").optional(),
});

// Schema para crear un equipo
const equipoSchema = z.object({
  idSolicitante: z.coerce.number().int().positive(),
  serial: z.string().trim().min(1),
  marca: z.string().trim().min(1),
  modelo: z.string().trim().min(1),
  procesador: z.string().trim().min(1),
  ram: z.string().trim().min(1),
  disco: z.string().trim().min(1),
  propiedad: z.string().trim().min(1),
});

// Schema parcial para actualizar
const equipoUpdateSchema = equipoSchema.partial();

/* ================== Helpers ================== */

function mapOrderBy(
  sortBy: string | undefined,
  sortDir: Prisma.SortOrder
): Prisma.EquipoOrderByWithRelationInput {
  if (sortBy === "empresa") {
    return { solicitante: { empresa: { nombre: sortDir } } };
  }
  if (sortBy === "solicitante") {
    return { solicitante: { nombre: sortDir } };
  }
  const allowed: Array<keyof Prisma.EquipoOrderByWithRelationInput> = [
    "id_equipo",
    "serial",
    "marca",
    "modelo",
    "procesador",
    "ram",
    "disco",
    "propiedad",
  ];
  const key = (allowed.includes(sortBy as any) ? sortBy : "id_equipo") as keyof Prisma.EquipoOrderByWithRelationInput;
  return { [key]: sortDir } as Prisma.EquipoOrderByWithRelationInput;
}

function flattenRow(e: any) {
  return {
    id_equipo: e.id_equipo,
    serial: e.serial,
    marca: e.marca,
    modelo: e.modelo,
    procesador: e.procesador,
    ram: e.ram,
    disco: e.disco,
    propiedad: e.propiedad,
    solicitante: e.solicitante?.nombre ?? null,
    empresa: e.solicitante?.empresa?.nombre ?? null,
    // ids de apoyo (útiles en frontend)
    idSolicitante: e.idSolicitante,
    empresaId: e.solicitante?.empresaId ?? null,
  };
}

/* ================== Controller: sólo GET list ================== */

/** GET /equipos  -> lista general para tabla */
export async function listEquipos(req: Request, res: Response) {
  try {
    const q = listQuerySchema.parse(req.query);
    const INS = "insensitive" as Prisma.QueryMode;

    // Tipado explícito para evitar errores con exactOptionalPropertyTypes
    const where: Prisma.EquipoWhereInput = {
      ...(q.empresaId ? { solicitante: { is: { empresaId: q.empresaId } } } : {}),
      ...(q.solicitanteId ? { idSolicitante: q.solicitanteId } : {}),
      ...(q.marca ? { marca: { equals: q.marca, mode: INS } } : {}),
      ...(q.search
        ? {
          OR: [
            { serial: { contains: q.search, mode: INS } },
            { marca: { contains: q.search, mode: INS } },
            { modelo: { contains: q.search, mode: INS } },
            { procesador: { contains: q.search, mode: INS } },
            { solicitante: { is: { nombre: { contains: q.search, mode: INS } } } },
            { solicitante: { is: { empresa: { is: { nombre: { contains: q.search, mode: INS } } } } } },
          ] satisfies Prisma.EquipoWhereInput[],
        }
        : {}),
    };

    const orderBy = mapOrderBy(q.sortBy, q.sortDir as Prisma.SortOrder);

    const [total, rows] = await Promise.all([
      prisma.equipo.count({ where }),
      prisma.equipo.findMany({
        where,
        include: { solicitante: { include: { empresa: true } } },
        orderBy,
        skip: (q.page - 1) * q.pageSize,
        take: q.pageSize,
      }),
    ]);

    const items = rows.map(flattenRow);

    return res.json({
      page: q.page,
      pageSize: q.pageSize,
      total,
      totalPages: Math.ceil(total / q.pageSize),
      items,
    });
  } catch (err: any) {
    console.error("listEquipos error:", err);
    if (err instanceof z.ZodError) {
      return res.status(400).json({ error: "Parámetros inválidos", details: err.flatten() });
    }
    return res.status(500).json({ error: "Error al listar equipos" });
  }
}

// 🟢 CREATE /equipos
export async function createEquipo(req: Request, res: Response) {
  try {
    const data = equipoSchema.parse(req.body);

    // Exclude idSolicitante from the main data object
    const { idSolicitante, ...equipoData } = data;

    const nuevo = await prisma.equipo.create({
      data: {
        ...equipoData,
        solicitante: { connect: { id_solicitante: idSolicitante } },
      },
      include: { solicitante: true },
    });

    return res.status(201).json(nuevo);
  } catch (err: any) {
    console.error("Error al crear equipo:", err);
    if (err instanceof z.ZodError) {
      return res.status(400).json({ error: "Datos inválidos", detalles: err.flatten() });
    }
    return res.status(500).json({ error: "Error al crear equipo" });
  }
}

// 🟣 READ ONE /equipos/:id
export async function getEquipoById(req: Request, res: Response) {
  try {
    const id = Number(req.params.id);
    if (isNaN(id)) return res.status(400).json({ error: "ID inválido" });

    const equipo = await prisma.equipo.findUnique({
      where: { id_equipo: id },
      include: { solicitante: true, equipo: true },
    });

    if (!equipo) return res.status(404).json({ error: "Equipo no encontrado" });

    return res.status(200).json(equipo);
  } catch (err) {
    console.error("Error al obtener equipo:", err);
    return res.status(500).json({ error: "Error al obtener equipo" });
  }
}

// 🟠 UPDATE /equipos/:id
export async function updateEquipo(req: Request, res: Response) {
  try {
    const id = Number(req.params.id);
    if (isNaN(id)) return res.status(400).json({ error: "ID inválido" });

    const data = equipoUpdateSchema.parse(req.body);

    // Prepara data para Prisma sin idSolicitante directo
    const dataToUpdate: any = { ...data };
    if (data.idSolicitante !== undefined) {
      dataToUpdate.solicitante = { connect: { id_solicitante: data.idSolicitante } };
      delete dataToUpdate.idSolicitante; // <-- eliminamos para evitar conflicto
    }

    const actualizado = await prisma.equipo.update({
      where: { id_equipo: id },
      data: dataToUpdate,
      include: { solicitante: true },
    });

    return res.status(200).json(actualizado);
  } catch (err: any) {
    console.error("Error al actualizar equipo:", err);
    if (err.code === "P2025") return res.status(404).json({ error: "Equipo no encontrado" });
    if (err instanceof z.ZodError) {
      return res.status(400).json({ error: "Datos inválidos", detalles: err.flatten() });
    }
    return res.status(500).json({ error: "Error al actualizar equipo" });
  }
}

// 🔴 DELETE /equipos/:id
export async function deleteEquipo(req: Request, res: Response) {
  try {
    const id = Number(req.params.id);
    if (isNaN(id)) return res.status(400).json({ error: "ID inválido" });

    await prisma.equipo.delete({ where: { id_equipo: id } });
    return res.status(204).send();
  } catch (err: any) {
    console.error("Error al eliminar equipo:", err);
    if (err.code === "P2025") return res.status(404).json({ error: "Equipo no encontrado" });
    return res.status(500).json({ error: "Error al eliminar equipo" });
  }
}