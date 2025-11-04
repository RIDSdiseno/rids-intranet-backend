// src/controllers/equipos.controller.ts
import type { Request, Response } from "express";
import type { Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma.js";
import { z } from "zod";

/* ================== Schemas ================== */
const listQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(200).default(20),
  search: z.string().trim().optional(),
  marca: z.string().trim().optional(),
  empresaId: z.coerce.number().int().optional(),
  solicitanteId: z.coerce.number().int().optional(),
  sortBy: z.enum(["id_equipo", "serial", "marca", "modelo", "procesador", "ram", "disco", "propiedad", "empresa", "solicitante"]).default("id_equipo").optional(),
  sortDir: z.enum(["asc", "desc"]).default("desc").optional(),
});

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

const equipoUpdateSchema = equipoSchema.partial();

/* ================== CACHE SIMPLE ================== */
// ✅ AGREGAR: Cache para resultados de consultas frecuentes
const equiposCache = new Map<string, { data: any; timestamp: number }>();
const CACHE_TTL = 15000; // 15 segundos

function getCacheKey(q: any): string {
  return `equipos:${JSON.stringify(q)}`;
}

function clearCache(): void {
  equiposCache.clear();
}

/* ================== Helpers Optimizados ================== */
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
    "id_equipo", "serial", "marca", "modelo", "procesador", "ram", "disco", "propiedad",
  ];
  const key = (allowed.includes(sortBy as any) ? sortBy : "id_equipo") as keyof Prisma.EquipoOrderByWithRelationInput;
  return { [key]: sortDir } as Prisma.EquipoOrderByWithRelationInput;
}

// ✅ OPTIMIZADO: Función más eficiente
function flattenRow(e: any) {
  const solicitante = e.solicitante;
  const empresa = solicitante?.empresa;

  return {
    id_equipo: e.id_equipo,
    serial: e.serial,
    marca: e.marca,
    modelo: e.modelo,
    procesador: e.procesador,
    ram: e.ram,
    disco: e.disco,
    propiedad: e.propiedad,
    solicitante: solicitante?.nombre ?? null,
    empresa: empresa?.nombre ?? null,
    idSolicitante: e.idSolicitante,
    empresaId: empresa?.id_empresa ?? null,
  };
}

/* ================== Controller Optimizado ================== */

/** GET /equipos - LISTA OPTIMIZADA */
export async function listEquipos(req: Request, res: Response) {
  const startTime = Date.now(); // ✅ MEDIR TIEMPO

  try {
    const q = listQuerySchema.parse(req.query);
    const INS = "insensitive" as Prisma.QueryMode;

    // ✅ VERIFICAR CACHE PRIMERO
    const cacheKey = getCacheKey(q);
    const cached = equiposCache.get(cacheKey);

    if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
      console.log(`✅ Cache hit para equipos: ${Date.now() - startTime}ms`);
      return res.json(cached.data);
    }

    // ✅ WHERE CLAUSE OPTIMIZADO
    const where: Prisma.EquipoWhereInput = {
      ...(q.empresaId ? { solicitante: { empresaId: q.empresaId } } : {}),
      ...(q.solicitanteId ? { idSolicitante: q.solicitanteId } : {}),
      ...(q.marca ? { marca: { equals: q.marca, mode: INS } } : {}),
      ...(q.search ? {
        OR: [
          { serial: { contains: q.search, mode: INS } },
          { marca: { contains: q.search, mode: INS } },
          { modelo: { contains: q.search, mode: INS } },
          { procesador: { contains: q.search, mode: INS } },
          { solicitante: { nombre: { contains: q.search, mode: INS } } },
          { solicitante: { empresa: { nombre: { contains: q.search, mode: INS } } } },
        ]
      } : {}),
    };

    const orderBy = mapOrderBy(q.sortBy, q.sortDir as Prisma.SortOrder);

    // ✅ CONSULTA OPTIMIZADA - SOLO CAMPOS NECESARIOS
    const [total, rows] = await Promise.all([
      prisma.equipo.count({ where }),
      prisma.equipo.findMany({
        where,
        select: { // ✅ SELECT EXPLÍCITO - NO USAR INCLUDE
          id_equipo: true,
          serial: true,
          marca: true,
          modelo: true,
          procesador: true,
          ram: true,
          disco: true,
          propiedad: true,
          idSolicitante: true,
          solicitante: {
            select: {
              nombre: true,
              empresa: {
                select: {
                  id_empresa: true,
                  nombre: true
                }
              }
            }
          }
        },
        orderBy,
        skip: (q.page - 1) * q.pageSize,
        take: q.pageSize,
      }),
    ]);

    const items = rows.map(flattenRow);
    const result = {
      page: q.page,
      pageSize: q.pageSize,
      total,
      totalPages: Math.ceil(total / q.pageSize),
      items,
    };

    // ✅ GUARDAR EN CACHE
    equiposCache.set(cacheKey, {
      data: result,
      timestamp: Date.now()
    });

    const endTime = Date.now();
    console.log(` Tiempo listEquipos: ${endTime - startTime}ms`);

    return res.json(result);
  } catch (err: any) {
    console.error("listEquipos error:", err);
    if (err instanceof z.ZodError) {
      return res.status(400).json({ error: "Parámetros inválidos", details: err.flatten() });
    }
    return res.status(500).json({ error: "Error al listar equipos" });
  }
}

// 🟢 CREATE /equipos - OPTIMIZADO
export async function createEquipo(req: Request, res: Response) {
  try {
    const data = equipoSchema.parse(req.body);
    const { idSolicitante, ...equipoData } = data;

    const nuevo = await prisma.equipo.create({
      data: {
        ...equipoData,
        solicitante: { connect: { id_solicitante: idSolicitante } },
      },
      select: { // ✅ SELECT OPTIMIZADO
        id_equipo: true,
        serial: true,
        marca: true,
        modelo: true,
        procesador: true,
        ram: true,
        disco: true,
        propiedad: true,
        idSolicitante: true,
        solicitante: {
          select: {
            nombre: true,
            empresa: {
              select: {
                nombre: true
              }
            }
          }
        }
      },
    });

    // ✅ LIMPIAR CACHE AL CREAR NUEVO REGISTRO
    clearCache();

    return res.status(201).json(nuevo);
  } catch (err: any) {
    console.error("Error al crear equipo:", err);
    if (err instanceof z.ZodError) {
      return res.status(400).json({ error: "Datos inválidos", detalles: err.flatten() });
    }
    return res.status(500).json({ error: "Error al crear equipo" });
  }
}

// 🟣 READ ONE /equipos/:id - OPTIMIZADO
export async function getEquipoById(req: Request, res: Response) {
  try {
    const id = Number(req.params.id);
    if (isNaN(id)) return res.status(400).json({ error: "ID inválido" });

    const equipo = await prisma.equipo.findUnique({
      where: { id_equipo: id },
      select: { // ✅ SELECT OPTIMIZADO - EVITAR INCLUDE COMPLETO
        id_equipo: true,
        serial: true,
        marca: true,
        modelo: true,
        procesador: true,
        ram: true,
        disco: true,
        propiedad: true,
        idSolicitante: true,
        solicitante: {
          select: {
            id_solicitante: true,
            nombre: true,
            email: true,
            empresa: {
              select: {
                id_empresa: true,
                nombre: true
              }
            }
          }
        }
        // ❌ ELIMINAR: equipo: true (si no es necesario)
      },
    });

    if (!equipo) return res.status(404).json({ error: "Equipo no encontrado" });

    return res.status(200).json(equipo);
  } catch (err) {
    console.error("Error al obtener equipo:", err);
    return res.status(500).json({ error: "Error al obtener equipo" });
  }
}

// 🟠 UPDATE /equipos/:id - OPTIMIZADO
export async function updateEquipo(req: Request, res: Response) {
  try {
    const id = Number(req.params.id);
    if (isNaN(id)) return res.status(400).json({ error: "ID inválido" });

    const data = equipoUpdateSchema.parse(req.body);
    const dataToUpdate: any = { ...data };

    if (data.idSolicitante !== undefined) {
      dataToUpdate.solicitante = { connect: { id_solicitante: data.idSolicitante } };
      delete dataToUpdate.idSolicitante;
    }

    const actualizado = await prisma.equipo.update({
      where: { id_equipo: id },
      data: dataToUpdate,
      select: { // ✅ SELECT OPTIMIZADO
        id_equipo: true,
        serial: true,
        marca: true,
        modelo: true,
        procesador: true,
        ram: true,
        disco: true,
        propiedad: true,
        idSolicitante: true,
        solicitante: {
          select: {
            nombre: true,
            empresa: {
              select: {
                nombre: true
              }
            }
          }
        }
      },
    });

    // ✅ LIMPIAR CACHE AL ACTUALIZAR
    clearCache();

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

// 🔴 DELETE /equipos/:id - OPTIMIZADO
export async function deleteEquipo(req: Request, res: Response) {
  try {
    const id = Number(req.params.id);
    if (isNaN(id)) return res.status(400).json({ error: "ID inválido" });

    await prisma.equipo.delete({ where: { id_equipo: id } });

    // ✅ LIMPIAR CACHE AL ELIMINAR
    clearCache();

    return res.status(204).send();
  } catch (err: any) {
    console.error("Error al eliminar equipo:", err);
    if (err.code === "P2025") return res.status(404).json({ error: "Equipo no encontrado" });
    return res.status(500).json({ error: "Error al eliminar equipo" });
  }
}

// ✅ LIMPIAR CACHE PERIÓDICAMENTE
setInterval(() => {
  equiposCache.clear();
  console.log('Cache de equipos limpiado');
}, CACHE_TTL * 4); // Cada minuto