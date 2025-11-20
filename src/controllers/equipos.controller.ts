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
  search: z.string().trim().optional(),        // serial/marca/modelo/procesador/solicitante/empresa

  marca: z.string().trim().optional(),
  empresaId: z.coerce.number().int().optional(),
  empresaName: z.string().trim().optional(),
  solicitanteId: z.coerce.number().int().optional(),
  sortBy: z.enum([
    "id_equipo","serial","marca","modelo","procesador","ram","disco","propiedad"
  ]).default("id_equipo").optional(), // ⚠️ quitamos empresa/solicitante porque ya no hay relaciones
  sortDir: z.enum(["asc", "desc"]).default("desc").optional(),
});

// ⚠️ OJO: el schema de BD NO cambia. Solo el payload de creación.
// Requerimos empresaId SIEMPRE y permitimos idSolicitante null.
const createEquipoSchema = z.object({
  empresaId: z.coerce.number().int().positive(),
  idSolicitante: z.coerce.number().int().positive().nullable().optional(),

  serial: z.string().trim().min(1),
  marca: z.string().trim().min(1),
  modelo: z.string().trim().min(1),
  procesador: z.string().trim().min(1),
  ram: z.string().trim().min(1),
  disco: z.string().trim().min(1),
  propiedad: z.string().trim().min(1),
});

// Para PATCH permitimos cambiar cualquier campo y
// idSolicitante puede venir null para “desasignar” (irá a placeholder).
const equipoUpdateSchema = z.object({
  idSolicitante: z.coerce.number().int().positive().nullable().optional(),
  serial: z.string().trim().min(1).optional(),
  marca: z.string().trim().min(1).optional(),
  modelo: z.string().trim().min(1).optional(),
  procesador: z.string().trim().min(1).optional(),
  ram: z.string().trim().min(1).optional(),
  disco: z.string().trim().min(1).optional(),
  propiedad: z.string().trim().min(1).optional(),

  // empresaId es opcional en PATCH y solo se usa si idSolicitante=null
  // para escoger el placeholder de ESA empresa (si quieres permitir ese caso).
  empresaId: z.coerce.number().int().positive().optional(),
});

/* ================== CACHE SIMPLE ================== */
const equiposCache = new Map<string, { data: any; timestamp: number }>();

function clearCache(): void {
  equiposCache.clear();
}

/* ================== Helpers ================== */
function mapOrderBy(
  sortBy: string | undefined,
  sortDir: Prisma.SortOrder
): Prisma.EquipoOrderByWithRelationInput {
  const allowed: Array<keyof Prisma.EquipoOrderByWithRelationInput> = [
    "id_equipo","serial","marca","modelo","procesador","ram","disco","propiedad"
  ];
  const key = (allowed.includes(sortBy as any)
    ? (sortBy as keyof Prisma.EquipoOrderByWithRelationInput)
    : "id_equipo") as keyof Prisma.EquipoOrderByWithRelationInput;
  return { [key]: sortDir } as Prisma.EquipoOrderByWithRelationInput;
}

// Tipado del row con relaciones que realmente usamos
type RowWithRels = {
  id_equipo: number;
  serial: string;
  marca: string;
  modelo: string;
  procesador: string;
  ram: string;
  disco: string;
  propiedad: string;
  idSolicitante: number;
  solicitante: {
    id_solicitante: number;
    nombre: string;
    empresaId: number | null;
    empresa: { id_empresa: number; nombre: string } | null;
  } | null;
};

function flattenRow(e: RowWithRels) {
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
    empresaId: e.solicitante?.empresa?.id_empresa ?? null,
    idSolicitante: e.idSolicitante,
  };
}

// Crea/obtiene el solicitante placeholder para una empresa
async function ensurePlaceholderSolicitante(empresaId: number) {
  const PLACEHOLDER_NAME = "[SIN SOLICITANTE]";
  const found = await prisma.solicitante.findFirst({
    where: { empresaId, nombre: PLACEHOLDER_NAME },
    select: { id_solicitante: true },
  });
  if (found) return found.id_solicitante;

  const created = await prisma.solicitante.create({
    data: {
      empresaId,
      nombre: PLACEHOLDER_NAME,
      // email y teléfono opcionales; email es unique en Cliente, no en Solicitante, así que OK
    },
    select: { id_solicitante: true },
  });
  return created.id_solicitante;
}

/* ================== Controller: LIST ================== */

export async function listEquipos(req: Request, res: Response) {
  try {
    const q = listQuerySchema.parse(req.query);
    const INS: Prisma.QueryMode = "insensitive";

    const where: Prisma.EquipoWhereInput = {
      ...(q.empresaId ? { solicitante: { is: { empresaId: q.empresaId } } } : {}),
      ...(q.empresaName
        ? { solicitante: { is: { empresa: { is: { nombre: { contains: q.empresaName, mode: INS } } } } } }
        : {}),
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
          ] as Prisma.EquipoWhereInput[],
        }
        : {}),
    };

    const orderBy = mapOrderBy(q.sortBy, q.sortDir as Prisma.SortOrder);

    const [total, rows] = await Promise.all([
      prisma.equipo.count({ where }),
      prisma.equipo.findMany({
        where,
        select: {
          id_equipo: true,
          serial: true,
          marca: true,
          modelo: true,
          procesador: true,
          ram: true,
          disco: true,
          propiedad: true,
          idSolicitante: true,
        },
        orderBy,
        skip: (q.page - 1) * q.pageSize,
        take: q.pageSize,
      }),
    ]);

    const items = (rows as unknown as RowWithRels[]).map(flattenRow);

    return res.json({
      page: q.page,
      pageSize: q.pageSize,
      total,
      totalPages: Math.max(1, Math.ceil(total / q.pageSize)),
      items,
    });
  } catch (err) {
    console.error("listEquipos error:", err);
    if (err instanceof z.ZodError) {
      return res
        .status(400)
        .json({ error: "Parámetros inválidos", details: err.flatten() });
    }
    return res.status(500).json({ error: "Error al listar equipos" });
  }
}

/* ================== CREATE ================== */

export async function createEquipo(req: Request, res: Response) {
  try {
    const data = createEquipoSchema.parse(req.body);
    const {
      empresaId,
      idSolicitante: idSolFromBody,
      serial,
      marca,
      modelo,
      procesador,
      ram,
      disco,
      propiedad,
    } = data;

    // validar empresa
    const empresa = await prisma.empresa.findUnique({
      where: { id_empresa: empresaId },
      select: { id_empresa: true },
    });
    if (!empresa) {
      return res.status(400).json({ error: "Empresa no encontrada" });
    }

    let idSolicitanteFinal: number;

    if (idSolFromBody == null) {
      // sin solicitante → conectamos al placeholder de ESA empresa
      idSolicitanteFinal = await ensurePlaceholderSolicitante(empresaId);
    } else {
      // con solicitante → validamos que pertenece a esa empresa
      const sol = await prisma.solicitante.findUnique({
        where: { id_solicitante: idSolFromBody },
        select: { id_solicitante: true, empresaId: true },
      });
      if (!sol) return res.status(400).json({ error: "Solicitante no encontrado" });
      if (sol.empresaId !== empresaId) {
        return res.status(400).json({ error: "El solicitante no pertenece a la empresa seleccionada" });
      }
      idSolicitanteFinal = sol.id_solicitante;
    }

    const nuevo = await prisma.equipo.create({
      data: {
        serial,
        marca,
        modelo,
        procesador,
        ram,
        disco,
        propiedad,
        solicitante: { connect: { id_solicitante: idSolicitanteFinal } },
      },
      include: { solicitante: { include: { empresa: true } } },
    });

    clearCache();
    return res.status(201).json(nuevo);
  } catch (err) {
    console.error("Error al crear equipo:", err);
    if (err instanceof z.ZodError) {
      return res
        .status(400)
        .json({ error: "Datos inválidos", detalles: err.flatten() });
    }
    return res.status(500).json({ error: "Error al crear equipo" });
  }
}

/* ================== READ ONE ================== */

export async function getEquipoById(req: Request, res: Response) {
  try {
    const id = Number(req.params.id);
    if (isNaN(id)) return res.status(400).json({ error: "ID inválido" });

    const equipo = await prisma.equipo.findUnique({
      where: { id_equipo: id },
      include: { solicitante: { include: { empresa: true } } },
    });
    if (!equipo) return res.status(404).json({ error: "Equipo no encontrado" });

    // enriquecer con nombres
    let solicitante: string | null = null;
    let empresa: string | null = null;
    let empresaId: number | null = null;
    if (equipo.idSolicitante != null) {
      const sol = await prisma.solicitante.findUnique({
        where: { id_solicitante: equipo.idSolicitante },
        select: { nombre: true, empresaId: true },
      });
      solicitante = sol?.nombre ?? null;
      empresaId = sol?.empresaId ?? null;
      if (empresaId != null) {
        const emp = await prisma.empresa.findUnique({
          where: { id_empresa: empresaId },
          select: { nombre: true },
        });
        empresa = emp?.nombre ?? null;
      }
    }

    return res.status(200).json({ ...equipo, solicitante, empresaId, empresa });
  } catch (err) {
    console.error("Error al obtener equipo:", err);
    return res.status(500).json({ error: "Error al obtener equipo" });
  }
}

/* ================== UPDATE ================== */

export async function updateEquipo(req: Request, res: Response) {
  try {
    const id = Number(req.params.id);
    if (isNaN(id)) return res.status(400).json({ error: "ID inválido" });

    const data = equipoUpdateSchema.parse(req.body);

    // Traemos el equipo actual (para conocer la empresa del solicitante actual si hace falta)
    const equipoActual = await prisma.equipo.findUnique({
      where: { id_equipo: id },
      include: { solicitante: { select: { id_solicitante: true, empresaId: true } } },
    });
    if (!equipoActual) {
      return res.status(404).json({ error: "Equipo no encontrado" });
    }

    let solicitanteUpdate: Prisma.SolicitanteUpdateOneRequiredWithoutEquiposNestedInput | undefined;

    if (data.idSolicitante !== undefined) {
      if (data.idSolicitante === null) {
        // reconectar a placeholder. ¿De qué empresa?
        const empresaId =
          data.empresaId ??
          equipoActual.solicitante?.empresaId; // usamos la empresa del solicitante actual si no mandan empresaId
        if (!empresaId) {
          return res.status(400).json({
            error: "Para desasignar el solicitante, especifica empresaId o el equipo debe tener uno actual",
          });
        }
        const placeholderId = await ensurePlaceholderSolicitante(empresaId);
        solicitanteUpdate = { connect: { id_solicitante: placeholderId } };
      } else {
        // validar solicitante existente
        const sol = await prisma.solicitante.findUnique({
          where: { id_solicitante: data.idSolicitante },
          select: { id_solicitante: true, empresaId: true },
        });
        if (!sol) return res.status(400).json({ error: "Solicitante no encontrado" });

        // si mandan empresaId en PATCH, exigimos coherencia
        if (data.empresaId && sol.empresaId !== data.empresaId) {
          return res.status(400).json({ error: "El solicitante no pertenece a la empresa indicada" });
        }

        solicitanteUpdate = { connect: { id_solicitante: sol.id_solicitante } };
      }
    }

    const dataToUpdate: Prisma.EquipoUpdateInput = {
      ...(data.serial ? { serial: data.serial } : {}),
      ...(data.marca ? { marca: data.marca } : {}),
      ...(data.modelo ? { modelo: data.modelo } : {}),
      ...(data.procesador ? { procesador: data.procesador } : {}),
      ...(data.ram ? { ram: data.ram } : {}),
      ...(data.disco ? { disco: data.disco } : {}),
      ...(data.propiedad ? { propiedad: data.propiedad } : {}),
      ...(solicitanteUpdate ? { solicitante: solicitanteUpdate } : {}),
    };

    const actualizado = await prisma.equipo.update({
      where: { id_equipo: id },
      data: dataToUpdate,
      include: { solicitante: { include: { empresa: true } } },
    });

    clearCache();
    return res.status(200).json(actualizado);
  } catch (err) {
    console.error("Error al actualizar equipo:", err);
    if ((err as { code?: string })?.code === "P2025") {
      return res.status(404).json({ error: "Equipo no encontrado" });
    }
    if ((err as { code?: string })?.code === "P2025") {
      return res.status(404).json({ error: "Equipo no encontrado" });
    }
    if (err instanceof z.ZodError) {
      return res
        .status(400)
        .json({ error: "Datos inválidos", detalles: err.flatten() });
    }
    return res.status(500).json({ error: "Error al actualizar equipo" });
  }
}

/* ================== DELETE ================== */

export async function deleteEquipo(req: Request, res: Response) {
  try {
    const id = Number(req.params.id);
    if (isNaN(id)) return res.status(400).json({ error: "ID inválido" });

    await prisma.equipo.delete({ where: { id_equipo: id } });
    clearCache();
    return res.status(204).send();
  } catch (err) {
    console.error("Error al eliminar equipo:", err);
    if ((err as { code?: string })?.code === "P2025") {
      return res.status(404).json({ error: "Equipo no encontrado" });
    }
    if ((err as { code?: string })?.code === "P2025") {
      return res.status(404).json({ error: "Equipo no encontrado" });
    }
    return res.status(500).json({ error: "Error al eliminar equipo" });
  }
}
