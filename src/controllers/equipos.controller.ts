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
