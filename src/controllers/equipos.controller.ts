// src/controllers/equipos.controller.ts
import type { Request, Response } from "express";
import { prisma } from "../lib/prisma.js";
import { z } from "zod";

// Importar solo lo que Prisma sí está exportando correctamente
import { Prisma, TipoEquipo, EstadoEquipo } from "@prisma/client";

import {
  calcularAnioPcDesdeSerial,
  normalizarAnioPc,
} from "../utils/equipos/anio-pc.util.js";

// Define AuditAction manualmente aquí para que no rompa el código de abajo
enum AuditAction {
  CREATE = 'CREATE',
  UPDATE = 'UPDATE',
  DELETE = 'DELETE'
}

/* ================== Schemas ================== */

const listQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(1000).default(20),

  search: z.string().trim().optional(),
  marca: z.string().trim().optional(),
  tipo: z.nativeEnum(TipoEquipo).optional(),

  anioPc: z.coerce.number().int().optional(),
  anioPcDesde: z.coerce.number().int().optional(),
  anioPcHasta: z.coerce.number().int().optional(),
  anioPcOrigen: z.enum(["AUTO", "MANUAL", "NO_DETERMINADO"]).optional(),

  createdFrom: z.coerce.date().optional(),
  createdTo: z.coerce.date().optional(),
  updatedFrom: z.coerce.date().optional(),
  updatedTo: z.coerce.date().optional(),

  auditTecnicoId: z.coerce.number().int().positive().optional(),
  auditFrom: z.coerce.date().optional(),
  auditTo: z.coerce.date().optional(),
  auditAction: z.enum(["CREATE", "UPDATE", "ALL"]).default("ALL").optional(),

  empresaId: z.coerce.number().int().optional(),
  empresaName: z.string().trim().optional(),
  solicitanteId: z.coerce.number().int().optional(),

  mode: z.enum(["full", "selector"]).default("full").optional(),

  estado: z.nativeEnum(EstadoEquipo).optional(),

  sortBy: z
    .enum([
      "id_equipo",
      "serial",
      "tipo",
      "estado",
      "marca",
      "modelo",
      "anioPc",
      "anioPcOrigen",
      "procesador",
      "ram",
      "disco",
      "propiedad",
      "createdAt",
      "updatedAt",
    ])
    .default("id_equipo")
    .optional(),

  sortDir: z.enum(["asc", "desc"]).default("desc").optional(),
});

// Nuevo: esquema para reasignar equipos por serial
const adicionalSchema = z.object({
  tipo: z.string().trim().min(1),
  descripcion: z.string().trim().optional().nullable(),
  cantidad: z.coerce.number().int().positive().default(1),
  serialAdicional: z.string().trim().optional().nullable(),
});

const createEquipoSchema = z.object({
  empresaId: z.coerce.number().int().positive().optional(),
  idSolicitante: z.coerce.number().int().positive().nullable().optional(),
  tipo: z.nativeEnum(TipoEquipo).default(TipoEquipo.GENERICO),
  serial: z.string().trim().min(1),
  marca: z.string().trim().min(1),
  modelo: z.string().trim().min(1),
  anioPc: z.coerce.number().int().nullable().optional(),
  anioPcOrigen: z.enum(["AUTO", "MANUAL", "NO_DETERMINADO"]).optional(),
  procesador: z.string().trim().min(1),
  ram: z.string().trim().min(1),
  disco: z.string().trim().min(1),
  propiedad: z.string().trim().min(1),
  estado: z.nativeEnum(EstadoEquipo).default(EstadoEquipo.ACTIVO),

  macWifi: z.string().optional(),
  redEthernet: z.string().optional(),
  so: z.string().optional(),
  tipoDd: z.string().optional(),
  estadoAlm: z.string().optional(),
  office: z.string().optional(),
  teamViewer: z.string().optional(),
  claveTv: z.string().optional(),
  revisado: z.string().optional(),
  adminRidsUsuario: z.string().optional(),
  adminRidsPassword: z.string().optional(),
  usuarioEmpresa: z.string().optional(),
  passwordEmpresa: z.string().optional(),
  usuarioPersonal: z.string().optional(),
  passwordPersonal: z.string().optional(),

  adicionales: z.array(adicionalSchema).optional().default([]),
});

// Nuevo: acepta 1 equipo o { equipos: [...] }
const createEquiposRequestSchema = z.union([
  createEquipoSchema,                 // 1 solo equipo
  z.array(createEquipoSchema).min(1), // array directo
  z.object({
    equipos: z.array(createEquipoSchema).min(1), // { equipos: [...] }
  }),
]);

// Esquema para actualizar equipo (todos los campos opcionales)
const equipoUpdateSchema = z.object({
  idSolicitante: z.coerce.number().int().positive().nullable().optional(),
  tipo: z.nativeEnum(TipoEquipo).optional(),
  serial: z.string().trim().min(1).optional(),
  marca: z.string().trim().min(1).optional(),
  modelo: z.string().trim().min(1).optional(),
  anioPc: z.coerce.number().int().nullable().optional(),
  anioPcOrigen: z.enum(["AUTO", "MANUAL", "NO_DETERMINADO"]).optional(),
  procesador: z.string().trim().min(1).optional(),
  ram: z.string().trim().min(1).optional(),
  disco: z.string().trim().min(1).optional(),
  propiedad: z.string().trim().min(1).optional(),

  adicionales: z.array(adicionalSchema).optional(),

  estado: z.nativeEnum(EstadoEquipo).optional(),

  // NUEVOS
  macWifi: z.string().optional(),
  redEthernet: z.string().optional(),
  so: z.string().optional(),
  tipoDd: z.string().optional(),
  estadoAlm: z.string().optional(),
  office: z.string().optional(),
  teamViewer: z.string().optional(),
  claveTv: z.string().optional(),
  revisado: z.string().optional(),
  adminRidsUsuario: z.string().optional(),
  adminRidsPassword: z.string().optional(),

  usuarioEmpresa: z.string().optional(),
  passwordEmpresa: z.string().optional(),

  usuarioPersonal: z.string().optional(),
  passwordPersonal: z.string().optional(),

  empresaId: z.coerce.number().int().positive().optional(),
});

/* ================== CACHE SIMPLE ================== */
const equiposCache = new Map<string, { data: any; timestamp: number }>();

function clearCache() {
  equiposCache.clear();
}

/* ================== Helpers ================== */

function mapOrderBy(
  sortBy: string | undefined,
  sortDir: Prisma.SortOrder
): Prisma.EquipoOrderByWithRelationInput {
  const allowed: Array<keyof Prisma.EquipoOrderByWithRelationInput> = [
    "id_equipo",
    "serial",
    "tipo",
    "marca",
    "modelo",
    "anioPc",
    "anioPcOrigen",
    "procesador",
    "ram",
    "disco",
    "propiedad",
    "createdAt",
    "updatedAt",
    "estado",
  ];

  const key = allowed.includes(sortBy as any)
    ? (sortBy as keyof Prisma.EquipoOrderByWithRelationInput)
    : "id_equipo";

  return { [key]: sortDir };
}

function normalizeRutSearch(value?: string | null): string {
  return String(value ?? "")
    .replace(/[^0-9kK]/g, "")
    .toUpperCase();
}

function rutWithDash(value?: string | null): string | null {
  const clean = normalizeRutSearch(value);

  if (!clean) return null;
  if (clean.length <= 1) return clean;

  const cuerpo = clean.slice(0, -1);
  const dv = clean.slice(-1);

  return `${cuerpo}-${dv}`;
}

// Convierte valores a bigint de forma segura (para el seed de fdSourceMap)
function flattenRow(e: any) {
  const detalle = e.detalle ?? null;

  return {
    id_equipo: e.id_equipo,
    serial: e.serial,
    tipo: e.tipo,
    marca: e.marca,
    modelo: e.modelo,
    anioPc: e.anioPc ?? null,
    anioPcOrigen: e.anioPcOrigen ?? null,
    procesador: e.procesador,
    ram: e.ram,
    disco: e.disco,
    propiedad: e.propiedad,

    createdAt: e.createdAt,
    updatedAt: e.updatedAt,

    solicitante: e.solicitante?.nombre ?? "[Sin solicitante]",
    solicitanteRut: e.solicitante?.rut ?? null,
    solicitanteEmail: e.solicitante?.email ?? null,

    empresa: e.solicitante?.empresa?.nombre ?? null,
    empresaId: e.solicitante?.empresa?.id_empresa ?? null,
    idSolicitante: e.idSolicitante,

    macWifi: detalle?.macWifi ?? null,
    redEthernet: detalle?.redEthernet ?? null,
    so: detalle?.so ?? null,
    tipoDd: detalle?.tipoDd ?? null,
    estadoAlm: detalle?.estadoAlm ?? null,
    office: detalle?.office ?? null,
    teamViewer: detalle?.teamViewer ?? null,
    claveTv: detalle?.claveTv ?? null,
    revisado: detalle?.revisado ?? null,

    adminRidsUsuario: detalle?.adminRidsUsuario ?? null,
    adminRidsPassword: detalle?.adminRidsPassword ?? null,
    usuarioEmpresa: detalle?.usuarioEmpresa ?? null,
    passwordEmpresa: detalle?.passwordEmpresa ?? null,
    usuarioPersonal: detalle?.usuarioPersonal ?? null,
    passwordPersonal: detalle?.passwordPersonal ?? null,

    adicionales: e.adicionales ?? [],

    estado: e.estado,
  };
}

// Asegura que exista un solicitante placeholder para la empresa dada, y devuelve su ID
async function ensurePlaceholderSolicitante(empresaId: number) {
  const PLACEHOLDER_NAME = "[SIN SOLICITANTE]";

  const found = await prisma.solicitante.findFirst({
    where: { empresaId, nombre: PLACEHOLDER_NAME },
    select: { id_solicitante: true },
  });

  if (found) return found.id_solicitante;

  const created = await prisma.solicitante.create({
    data: { empresaId, nombre: PLACEHOLDER_NAME },
    select: { id_solicitante: true },
  });

  return created.id_solicitante;
}

/* ================== LIST ================== */
export async function listEquipos(req: Request, res: Response) {
  try {
    const q = listQuerySchema.parse(req.query);
    const INS: Prisma.QueryMode = "insensitive";

    const user = (req as any).user;

    let auditEquipoIds: number[] | null = null;

    const tieneFiltroAuditoria =
      Boolean(q.auditTecnicoId) ||
      Boolean(q.auditFrom) ||
      Boolean(q.auditTo) ||
      (Boolean(q.auditAction) && q.auditAction !== "ALL");

    if (tieneFiltroAuditoria) {
      const auditWhere: Prisma.AuditLogWhereInput = {
        entity: {
          in: ["Equipo", "DetalleEquipo"],
        },

        ...(q.auditTecnicoId
          ? {
            actorId: q.auditTecnicoId,
          }
          : {}),

        ...(q.auditAction && q.auditAction !== "ALL"
          ? {
            action: q.auditAction as any,
          }
          : {
            action: {
              in: [AuditAction.CREATE, AuditAction.UPDATE],
            } as any,
          }),

        ...(q.auditFrom || q.auditTo
          ? {
            createdAt: {
              ...(q.auditFrom ? { gte: q.auditFrom } : {}),
              ...(q.auditTo ? { lte: q.auditTo } : {}),
            },
          }
          : {}),
      };

      const logs = await prisma.auditLog.findMany({
        where: auditWhere,
        select: {
          entity: true,
          entityId: true,
        },
      });

      const equipoIdsDirectos = logs
        .filter((l) => l.entity === "Equipo")
        .map((l) => Number(l.entityId))
        .filter((n) => Number.isFinite(n));

      const detalleIds = logs
        .filter((l) => l.entity === "DetalleEquipo")
        .map((l) => Number(l.entityId))
        .filter((n) => Number.isFinite(n));

      let equipoIdsDesdeDetalle: number[] = [];

      if (detalleIds.length > 0) {
        const detalles = await prisma.detalleEquipo.findMany({
          where: {
            id: {
              in: detalleIds,
            },
          },
          select: {
            idEquipo: true,
          },
        });

        equipoIdsDesdeDetalle = detalles
          .map((d) => d.idEquipo)
          .filter((n): n is number => Number.isFinite(Number(n)));
      }

      auditEquipoIds = Array.from(
        new Set([...equipoIdsDirectos, ...equipoIdsDesdeDetalle])
      );
    }

    const searchText = String(q.search ?? "").trim();
    const searchRutClean = normalizeRutSearch(searchText);
    const searchRutDash = rutWithDash(searchText);

    let solicitanteIdsByRut: number[] = [];

    if (searchRutClean.length >= 5) {
      const rowsRut = await prisma.$queryRaw<Array<{ id_solicitante: number }>>`
    SELECT id_solicitante
    FROM "Solicitante"
    WHERE rut IS NOT NULL
      AND REGEXP_REPLACE(UPPER(rut), '[^0-9K]', '', 'g') LIKE ${`%${searchRutClean}%`}
  `;

      solicitanteIdsByRut = rowsRut.map((r) => r.id_solicitante);
    }

    const andConditions: Prisma.EquipoWhereInput[] = [];

    /* =========================
       Restricción por rol CLIENTE
    ========================= */
    if (user?.rol === "CLIENTE") {
      andConditions.push({
        solicitante: {
          is: {
            empresaId: user.empresaId,
          },
        },
      });
    } else if (q.empresaId) {
      andConditions.push({
        solicitante: {
          is: {
            empresaId: q.empresaId,
          },
        },
      });
    }

    /* =========================
       Filtro por nombre empresa
    ========================= */
    if (q.empresaName) {
      andConditions.push({
        solicitante: {
          is: {
            empresa: {
              is: {
                nombre: {
                  contains: q.empresaName,
                  mode: INS,
                },
              },
            },
          },
        },
      });
    }

    /* =========================
       Filtros directos
    ========================= */
    if (q.solicitanteId) {
      andConditions.push({
        idSolicitante: q.solicitanteId,
      });
    }

    if (q.marca) {
      andConditions.push({
        marca: {
          equals: q.marca,
          mode: INS,
        },
      });
    }

    if (q.tipo) {
      andConditions.push({
        tipo: q.tipo,
      });
    }

    if (q.anioPc) {
      andConditions.push({
        anioPc: q.anioPc,
      });
    }

    if (q.anioPcDesde || q.anioPcHasta) {
      andConditions.push({
        anioPc: {
          ...(q.anioPcDesde ? { gte: q.anioPcDesde } : {}),
          ...(q.anioPcHasta ? { lte: q.anioPcHasta } : {}),
        },
      });
    }

    if (q.anioPcOrigen) {
      andConditions.push({
        anioPcOrigen: q.anioPcOrigen,
      });
    }

    if (q.estado) {
      andConditions.push({
        estado: q.estado,
      });
    }

    /* =========================
       Fechas
    ========================= */
    if (q.createdFrom || q.createdTo) {
      andConditions.push({
        createdAt: {
          ...(q.createdFrom ? { gte: q.createdFrom } : {}),
          ...(q.createdTo ? { lte: q.createdTo } : {}),
        },
      });
    }

    if (q.updatedFrom || q.updatedTo) {
      andConditions.push({
        updatedAt: {
          ...(q.updatedFrom ? { gte: q.updatedFrom } : {}),
          ...(q.updatedTo ? { lte: q.updatedTo } : {}),
        },
      });
    }

    /* =========================
       Búsqueda general
    ========================= */
    if (searchText) {
      const orConditions: Prisma.EquipoWhereInput[] = [
        {
          serial: {
            contains: searchText,
            mode: INS,
          },
        },
        {
          marca: {
            contains: searchText,
            mode: INS,
          },
        },
        {
          modelo: {
            contains: searchText,
            mode: INS,
          },
        },
        {
          procesador: {
            contains: searchText,
            mode: INS,
          },
        },
        {
          solicitante: {
            is: {
              nombre: {
                contains: searchText,
                mode: INS,
              },
            },
          },
        },
        {
          solicitante: {
            is: {
              email: {
                contains: searchText,
                mode: INS,
              },
            },
          },
        },
        {
          solicitante: {
            is: {
              rut: {
                contains: searchText,
                mode: INS,
              },
            },
          },
        },
        {
          solicitante: {
            is: {
              empresa: {
                is: {
                  nombre: {
                    contains: searchText,
                    mode: INS,
                  },
                },
              },
            },
          },
        },
      ];

      if (searchRutDash) {
        orConditions.push({
          solicitante: {
            is: {
              rut: {
                contains: searchRutDash,
                mode: INS,
              },
            },
          },
        });
      }

      if (searchRutClean) {
        orConditions.push({
          solicitante: {
            is: {
              rut: {
                contains: searchRutClean,
                mode: INS,
              },
            },
          },
        });
      }

      if (solicitanteIdsByRut.length > 0) {
        orConditions.push({
          idSolicitante: {
            in: solicitanteIdsByRut,
          },
        });
      }

      if (Number.isFinite(Number(searchText))) {
        orConditions.push({
          id_equipo: Number(searchText),
        });
      }

      andConditions.push({
        OR: orConditions,
      });
    }

    /* =========================
       Filtro por auditoría
    ========================= */
    if (auditEquipoIds) {
      andConditions.push({
        id_equipo: {
          in: auditEquipoIds.length > 0 ? auditEquipoIds : [-1],
        },
      });
    }

    /* =========================
       WHERE final
    ========================= */
    const where: Prisma.EquipoWhereInput =
      andConditions.length > 0
        ? {
          AND: andConditions,
        }
        : {};

    // Si el cliente está filtrando por empresaId, forzamos que solo vea esa empresa (incluso si intenta usar empresaName para evadirlo)
    const orderBy = mapOrderBy(q.sortBy, q.sortDir as Prisma.SortOrder);
    const skip = (q.page - 1) * q.pageSize;

    const total = await prisma.equipo.count({ where });

    if (q.mode === "selector") {
      const items = await prisma.equipo.findMany({
        where,
        select: {
          id_equipo: true,
          serial: true,
          marca: true,
          modelo: true,
          tipo: true,
          estado: true,
          anioPc: true,
          anioPcOrigen: true,
        },
        orderBy,
        skip,
        take: q.pageSize,
      });

      return res.json({
        page: q.page,
        pageSize: q.pageSize,
        total,
        totalPages: Math.max(1, Math.ceil(total / q.pageSize)),
        items,
      });
    }

    const rows = await prisma.equipo.findMany({
      where,
      include: {
        solicitante: { include: { empresa: true } },
        detalle: true,
        adicionales: true,
      },
      orderBy,
      skip,
      take: q.pageSize,
    });

    return res.json({
      page: q.page,
      pageSize: q.pageSize,
      total,
      totalPages: Math.max(1, Math.ceil(total / q.pageSize)),
      items: rows.map(flattenRow),
    });
  } catch (err) {
    console.error("[listEquipos] error:", {
      message: (err as any)?.message,
      code: (err as any)?.code,
      meta: (err as any)?.meta,
      stack: (err as any)?.stack,
    });
    if (err instanceof z.ZodError) {
      return res.status(400).json({
        error: "Parámetros inválidos",
        details: err.flatten(),
      });
    }
    return res.status(500).json({ error: "Error al listar equipos" });
  }
}

/* ================== CREATE (single o bulk) ================== */
export async function createEquipo(req: Request, res: Response) {
  try {
    const parsed = createEquiposRequestSchema.parse(req.body);

    const equiposToCreate = Array.isArray(parsed)
      ? parsed
      : "equipos" in parsed
        ? parsed.equipos
        : [parsed];


    const created: any[] = [];
    const errors: any[] = [];

    // transacción para que sea más estable
    for (const data of equiposToCreate) {
      try {

        const existe = await prisma.equipo.findUnique({
          where: { serial: data.serial },
        });

        if (existe) {
          errors.push({
            serial: data.serial,
            error: "Ya existe un equipo con ese serial",
          });
          continue;
        }

        let idSolicitanteFinal: number | null = data.idSolicitante ?? null;

        if (!idSolicitanteFinal && data.empresaId) {
          idSolicitanteFinal = await ensurePlaceholderSolicitante(data.empresaId);
        }

        const bodyTieneAnioPc = Object.prototype.hasOwnProperty.call(data, "anioPc");

        const anioPcManual = bodyTieneAnioPc
          ? normalizarAnioPc(data.anioPc)
          : null;

        const calculoAnioPc = calcularAnioPcDesdeSerial(
          data.serial,
          data.marca,
          data.modelo
        );

        const anioPcFinal = bodyTieneAnioPc
          ? anioPcManual
          : calculoAnioPc.anioPc;

        const anioPcOrigenFinal = bodyTieneAnioPc
          ? anioPcManual
            ? "MANUAL"
            : "NO_DETERMINADO"
          : calculoAnioPc.anioPc
            ? "AUTO"
            : "NO_DETERMINADO";

        // Si no se dio ni idSolicitante ni empresaId, el equipo quedará sin solicitante (idSolicitante = null), lo cual es permitido. Luego se podrá reasignar desde el update indicando el idSolicitante o la empresaId para conectar al placeholder.
        const equipo = await prisma.equipo.create({
          data: {
            tipo: data.tipo,
            marca: data.marca,
            modelo: data.modelo,
            anioPc: anioPcFinal,
            anioPcOrigen: anioPcOrigenFinal,
            serial: data.serial,
            procesador: data.procesador,
            ram: data.ram,
            disco: data.disco,
            propiedad: data.propiedad,
            idSolicitante: idSolicitanteFinal,
            estado: data.estado,

            detalle: {
              create: {
                macWifi: data.macWifi ?? null,
                redEthernet: data.redEthernet ?? null,
                so: data.so ?? null,
                tipoDd: data.tipoDd ?? null,
                estadoAlm: data.estadoAlm ?? null,
                office: data.office ?? null,
                teamViewer: data.teamViewer ?? null,
                claveTv: data.claveTv ?? null,
                revisado: data.revisado ?? null,
                adminRidsUsuario: data.adminRidsUsuario ?? null,
                adminRidsPassword: data.adminRidsPassword ?? null,
                usuarioEmpresa: data.usuarioEmpresa ?? null,
                passwordEmpresa: data.passwordEmpresa ?? null,
                usuarioPersonal: data.usuarioPersonal ?? null,
                passwordPersonal: data.passwordPersonal ?? null,
              },
            },

            adicionales: {
              create: (data.adicionales ?? [])
                .filter((a) => !!a?.tipo?.trim())
                .map((a) => ({
                  tipo: a.tipo.trim(),
                  descripcion: a.descripcion?.trim() || null,
                  cantidad: Number(a.cantidad) > 0 ? Number(a.cantidad) : 1,
                  serialAdicional: a.serialAdicional?.trim() || null,
                })),
            },
          },
          include: {
            solicitante: { include: { empresa: true } },
            detalle: true,
            adicionales: true,
          },
        });

        created.push(equipo);

      } catch (e: any) {
        errors.push({
          serial: data.serial,
          error: e?.message ?? "Error desconocido",
        });
      }
    }

    clearCache();

    return res.status(201).json({
      ok: true,
      totalReceived: equiposToCreate.length,
      totalCreated: created.length,
      totalErrors: errors.length,
      created,
      errors,
    });
  } catch (err) {
    console.error("createEquipo error:", err);

    if (err instanceof z.ZodError) {
      return res.status(400).json({
        error: "Datos inválidos",
        details: err.flatten(),
      });
    }

    return res.status(500).json({ error: "Error al crear equipo(s)" });
  }
}

/* ================== READ ONE ================== */
export async function getEquipoById(req: Request, res: Response) {
  try {
    const id = Number(req.params.id);
    if (!Number.isFinite(id) || id <= 0) {
      return res.status(400).json({ error: "ID inválido" });
    }

    const user = (req as any).user;

    const equipo = await prisma.equipo.findUnique({
      where: { id_equipo: id },
      include: {
        solicitante: { include: { empresa: true } },
        detalle: true,
        adicionales: true,
      },
    });

    if (!equipo) return res.status(404).json({ error: "Equipo no encontrado" });

    // Si es CLIENTE, valida que el equipo sea de su empresa
    if (user?.rol === "CLIENTE") {
      const empresaEquipoId = equipo.solicitante?.empresaId ?? null;
      if (!empresaEquipoId || empresaEquipoId !== user.empresaId) {
        return res.status(403).json({ error: "No autorizado" });
      }
    }

    // Busca el log CREATE (primero en el tiempo)
    const createLog = await prisma.auditLog.findFirst({
      where: {
        entity: "Equipo",
        entityId: String(id),
        action: AuditAction.CREATE,
        ...(user?.rol === "CLIENTE" ? { empresaId: user.empresaId } : {}),
      },
      include: {
        actor: { select: { id_tecnico: true, nombre: true, email: true } },
      },
      orderBy: { createdAt: "asc" },
    });

    return res.status(200).json({
      ...equipo,
      creadoPor: createLog?.actor
        ? {
          id_tecnico: createLog.actor.id_tecnico,
          nombre: createLog.actor.nombre,
          email: createLog.actor.email,
        }
        : null,
      creadoEn: createLog?.createdAt ?? null,
    });
  } catch (err) {
    console.error("getEquipoById error:", err);
    return res.status(500).json({ error: "Error al obtener equipo" });
  }
}

/* ================== UPDATE ================== */
export async function updateEquipo(req: Request, res: Response) {
  try {
    const id = Number(req.params.id);
    if (isNaN(id)) return res.status(400).json({ error: "ID inválido" });

    const data = equipoUpdateSchema.parse(req.body);

    const {
      macWifi,
      redEthernet,
      so,
      tipoDd,
      estadoAlm,
      office,
      teamViewer,
      claveTv,
      revisado,

      adminRidsUsuario,
      adminRidsPassword,
      usuarioEmpresa,
      passwordEmpresa,
      usuarioPersonal,
      passwordPersonal,
      adicionales,

      anioPc,
      anioPcOrigen,

      ...equipoData
    } = data;

    // Validar empresaId si viene
    const equipoActual = await prisma.equipo.findUnique({
      where: { id_equipo: id },
      select: {
        anioPc: true,
        anioPcOrigen: true,
        serial: true,
        marca: true,
        modelo: true,
        procesador: true,
        solicitante: {
          select: {
            empresaId: true,
          },
        },
      },
    });

    if (!equipoActual) {
      return res.status(404).json({ error: "Equipo no encontrado" });
    }

    const procesadorFinal = equipoData.procesador ?? equipoActual.procesador;

    const modeloFinal = equipoData.modelo ?? equipoActual.modelo;

    const serialNuevo = equipoData.serial?.trim().toUpperCase();

    if (serialNuevo && serialNuevo !== equipoActual.serial?.trim().toUpperCase()) {
      const serialDuplicado = await prisma.equipo.findFirst({
        where: {
          serial: serialNuevo,
          NOT: {
            id_equipo: id,
          },
        },
        select: {
          id_equipo: true,
          serial: true,
        },
      });

      if (serialDuplicado) {
        return res.status(409).json({
          ok: false,
          code: "SERIAL_DUPLICADO",
          field: "serial",
          serial: serialNuevo,
          error: `Ya existe un equipo registrado con el serial ${serialNuevo}`,
          message: `Ya existe un equipo registrado con el serial ${serialNuevo}`,
        });
      }

      equipoData.serial = serialNuevo;
    }

    let solicitanteUpdate: Prisma.SolicitanteUpdateOneWithoutEquiposNestedInput | undefined;

    // Si se dio idSolicitante, conectamos al solicitante indicado (puede ser null para desasignar)
    if (data.idSolicitante !== undefined) {
      if (data.idSolicitante === null) {
        const empresaId = data.empresaId ?? equipoActual.solicitante?.empresaId;

        if (!empresaId) {
          return res.status(400).json({
            error: "Para desasignar solicitante debes indicar empresaId",
          });
        }

        const placeholderId = await ensurePlaceholderSolicitante(empresaId);
        solicitanteUpdate = { connect: { id_solicitante: placeholderId } };
      } else {
        solicitanteUpdate = { connect: { id_solicitante: data.idSolicitante } };
      }
    }

    const serialFinal = equipoData.serial ?? equipoActual.serial;
    const marcaFinal = equipoData.marca ?? equipoActual.marca;

    const bodyTieneAnioPc = Object.prototype.hasOwnProperty.call(data, "anioPc");

    let anioPcFinal: number | null = equipoActual.anioPc;
    let anioPcOrigenFinal = equipoActual.anioPcOrigen ?? "NO_DETERMINADO";

    const cambioDatosCalculo =
      equipoData.serial !== undefined ||
      equipoData.marca !== undefined ||
      equipoData.modelo !== undefined ||
      equipoData.procesador !== undefined;

    if (bodyTieneAnioPc) {
      const anioPcManual = normalizarAnioPc(anioPc);

      anioPcFinal = anioPcManual;
      anioPcOrigenFinal = anioPcManual ? "MANUAL" : "NO_DETERMINADO";
    } else if (equipoActual.anioPcOrigen !== "MANUAL" && cambioDatosCalculo) {

      const calculoAnioPc = calcularAnioPcDesdeSerial(
        serialFinal,
        marcaFinal,
        modeloFinal,
        procesadorFinal
      );

      anioPcFinal = calculoAnioPc.anioPc;
      anioPcOrigenFinal = calculoAnioPc.anioPcOrigen;
    }

    // Si se dio empresaId pero no idSolicitante, conectamos al placeholder de esa empresa
    const actualizado = await prisma.equipo.update({
      where: { id_equipo: id },
      data: {
        ...(equipoData.tipo ? { tipo: equipoData.tipo } : {}),
        ...(equipoData.serial ? { serial: equipoData.serial } : {}),
        ...(equipoData.marca ? { marca: equipoData.marca } : {}),
        ...(equipoData.modelo ? { modelo: equipoData.modelo } : {}),
        ...(equipoData.procesador ? { procesador: equipoData.procesador } : {}),
        ...(equipoData.ram ? { ram: equipoData.ram } : {}),
        ...(equipoData.disco ? { disco: equipoData.disco } : {}),
        ...(equipoData.propiedad ? { propiedad: equipoData.propiedad } : {}),
        ...(solicitanteUpdate ? { solicitante: solicitanteUpdate } : {}),
        ...(equipoData.estado !== undefined ? { estado: equipoData.estado } : {}),

        anioPc: anioPcFinal,
        anioPcOrigen: anioPcOrigenFinal,

        detalle: {
          upsert: {
            create: {
              macWifi: macWifi ?? null,
              redEthernet: redEthernet ?? null,
              so: so ?? null,
              tipoDd: tipoDd ?? null,
              estadoAlm: estadoAlm ?? null,
              office: office ?? null,
              teamViewer: teamViewer ?? null,
              claveTv: claveTv ?? null,
              revisado: revisado ?? null,
              adminRidsUsuario: adminRidsUsuario ?? null,
              adminRidsPassword: adminRidsPassword ?? null,
              usuarioEmpresa: usuarioEmpresa ?? null,
              passwordEmpresa: passwordEmpresa ?? null,
              usuarioPersonal: usuarioPersonal ?? null,
              passwordPersonal: passwordPersonal ?? null,
            },
            update: {
              macWifi: macWifi ?? null,
              redEthernet: redEthernet ?? null,
              so: so ?? null,
              tipoDd: tipoDd ?? null,
              estadoAlm: estadoAlm ?? null,
              office: office ?? null,
              teamViewer: teamViewer ?? null,
              claveTv: claveTv ?? null,
              revisado: revisado ?? null,
              adminRidsUsuario: adminRidsUsuario ?? null,
              adminRidsPassword: adminRidsPassword ?? null,
              usuarioEmpresa: usuarioEmpresa ?? null,
              passwordEmpresa: passwordEmpresa ?? null,
              usuarioPersonal: usuarioPersonal ?? null,
              passwordPersonal: passwordPersonal ?? null,
            },
          },
        },

        ...(adicionales !== undefined
          ? {
            adicionales: {
              deleteMany: {},
              create: adicionales
                .filter((a) => !!a?.tipo?.trim())
                .map((a) => ({
                  tipo: a.tipo.trim(),
                  descripcion: a.descripcion?.trim() || null,
                  cantidad: Number(a.cantidad) > 0 ? Number(a.cantidad) : 1,
                  serialAdicional: a.serialAdicional?.trim() || null,
                })),
            },
          }
          : {}),
      },
      include: {
        solicitante: { include: { empresa: true } },
        detalle: true,
        adicionales: true,
      },
    });

    clearCache();
    return res.status(200).json(actualizado);
  } catch (err) {
    console.error("updateEquipo error:", err);

    if ((err as { code?: string })?.code === "P2025") {
      return res.status(404).json({ error: "Equipo no encontrado" });
    }

    if ((err as { code?: string })?.code === "P2002") {
      return res.status(409).json({
        ok: false,
        code: "SERIAL_DUPLICADO",
        field: "serial",
        error: "Ya existe un equipo registrado con ese serial",
        message: "Ya existe un equipo registrado con ese serial",
      });
    }

    if (err instanceof z.ZodError) {
      return res.status(400).json({ error: "Datos inválidos", details: err.flatten() });
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
    console.error("deleteEquipo error:", err);

    if ((err as { code?: string })?.code === "P2025") {
      return res.status(404).json({ error: "Equipo no encontrado" });
    }

    return res.status(500).json({ error: "Error al eliminar equipo" });
  }
}

/* ================== EQUIPOS POR EMPRESA (MODAL) ================== */
// GET /api/empresas/:empresaId/equipos
export async function getEquiposByEmpresa(req: Request, res: Response) {
  try {
    const empresaId = Number(req.params.empresaId);

    const user = (req as any).user;

    if (user?.rol === "CLIENTE" && empresaId !== user.empresaId) {
      return res.status(403).json({ error: "No autorizado" });
    }

    if (!Number.isInteger(empresaId) || empresaId <= 0) {
      return res.status(400).json({ error: "empresaId inválido" });
    }

    const equipos = await prisma.equipo.findMany({
      where: {
        solicitante: {
          empresaId,
        },
      },
      include: {
        solicitante: {
          select: {
            id_solicitante: true,
            nombre: true,
            rut: true,
            email: true,
          },
        },
      },
      orderBy: { id_equipo: "asc" },
    });

    return res.json({
      total: equipos.length,
      items: equipos,
    });
  } catch (err) {
    console.error("getEquiposByEmpresa error:", err);
    return res.status(500).json({
      error: "Error al obtener equipos por empresa",
    });
  }
}

// POST /api/equipos/reassign
const reassignEquiposSchema = z.object({
  equipos: z.array(
    z.object({
      serial: z.string().trim().min(1),
      idSolicitante: z.coerce.number().int().positive(),
    })
  ).min(1),
});

// Reasigna múltiples equipos a nuevos solicitantes por serial
export async function reassignEquipos(req: Request, res: Response) {
  try {
    const { equipos } = reassignEquiposSchema.parse(req.body);

    const updated: any[] = [];
    const errors: any[] = [];

    for (const item of equipos) {
      try {
        const equipo = await prisma.equipo.findUnique({
          where: { serial: item.serial },
        });

        if (!equipo) {
          errors.push({ serial: item.serial, error: "Equipo no encontrado" });
          continue;
        }

        const solicitante = await prisma.solicitante.findUnique({
          where: { id_solicitante: item.idSolicitante },
        });

        if (!solicitante) {
          errors.push({
            serial: item.serial,
            error: `Solicitante ${item.idSolicitante} no existe`,
          });
          continue;
        }

        const upd = await prisma.equipo.update({
          where: { serial: item.serial },
          data: { idSolicitante: solicitante.id_solicitante },
        });

        updated.push(upd);
      } catch (e: any) {
        errors.push({
          serial: item.serial,
          error: e?.message ?? "Error desconocido",
        });
      }
    }

    return res.json({
      ok: true,
      totalReceived: equipos.length,
      totalUpdated: updated.length,
      totalErrors: errors.length,
      updated,
      errors,
    });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return res.status(400).json({ error: "Datos inválidos", details: err.flatten() });
    }
    console.error("reassignEquipos error:", err);
    return res.status(500).json({ error: "Error al reasignar equipos" });
  }
}

/* ================== HISTORIAL POR EQUIPO ================== */
// GET /api/equipos/:id/historial
export async function getEquipoHistorial(req: Request, res: Response) {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({ error: "ID inválido" });
    }

    const user = (req as any).user;

    // ✅ Busca el id del detalle para cruzar sus logs
    const detalle = await prisma.detalleEquipo.findUnique({
      where: { idEquipo: id },
      select: { id: true },
    });

    const [logsEquipo, logsDetalle] = await Promise.all([
      prisma.auditLog.findMany({
        where: {
          entity: "Equipo",
          entityId: String(id),
          ...(user?.rol === "CLIENTE" ? { empresaId: user.empresaId } : {}),
        },
        include: {
          actor: { select: { id_tecnico: true, nombre: true, email: true } },
        },
      }),

      // ✅ También trae logs de DetalleEquipo
      detalle
        ? prisma.auditLog.findMany({
          where: {
            entity: "DetalleEquipo",
            entityId: String(detalle.id),
            ...(user?.rol === "CLIENTE" ? { empresaId: user.empresaId } : {}),
          },
          include: {
            actor: { select: { id_tecnico: true, nombre: true, email: true } },
          },
        })
        : Promise.resolve([]),
    ]);

    // ✅ Fusiona y ordena por fecha desc
    const merged = [...logsEquipo, ...logsDetalle].sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );

    return res.json({ total: merged.length, items: merged });
  } catch (err) {
    console.error("getEquipoHistorial error:", err);
    return res.status(500).json({ error: "Error al obtener historial del equipo" });
  }
}

/* ================== RECALCULAR AÑO PC EQUIPOS EXISTENTES ================== */

const recalcularAnioPcSchema = z.object({
  empresaId: z.coerce.number().int().positive().optional(),

  /**
   * force false:
   *   recalcula solo equipos sin año o NO_DETERMINADO.
   *
   * force true:
   *   recalcula también los AUTO.
   *
   * Nunca toca MANUAL.
   */
  force: z.coerce.boolean().optional().default(false),
});

export async function recalcularAnioPcEquipos(req: Request, res: Response) {
  try {
    const body = recalcularAnioPcSchema.parse(req.body ?? {});
    const user = (req as any).user;

    const andConditions: Prisma.EquipoWhereInput[] = [];

    if (user?.rol === "CLIENTE") {
      andConditions.push({
        solicitante: {
          is: {
            empresaId: user.empresaId,
          },
        },
      });
    } else if (body.empresaId) {
      andConditions.push({
        solicitante: {
          is: {
            empresaId: body.empresaId,
          },
        },
      });
    }

    if (body.force) {
      andConditions.push({
        OR: [
          { anioPc: null },
          { anioPcOrigen: null },
          { anioPcOrigen: "AUTO" },
          { anioPcOrigen: "NO_DETERMINADO" },
        ],
      });
    } else {
      andConditions.push({
        OR: [
          { anioPc: null },
          { anioPcOrigen: null },
          { anioPcOrigen: "NO_DETERMINADO" },
        ],
      });
    }

    andConditions.push({
      NOT: {
        anioPcOrigen: "MANUAL",
      },
    });

    const where: Prisma.EquipoWhereInput = {
      AND: andConditions,
    };

    const equipos = await prisma.equipo.findMany({
      where,
      select: {
        id_equipo: true,
        serial: true,
        marca: true,
        modelo: true,
        procesador: true,
        anioPc: true,
        anioPcOrigen: true,
      },
      orderBy: {
        id_equipo: "asc",
      },
    });

    let actualizados = 0;
    let noDeterminados = 0;
    let sinCambios = 0;

    const resultados: Array<{
      id_equipo: number;
      serial: string | null;
      marca: string | null;
      anioPcAnterior: number | null;
      anioPcNuevo: number | null;
      anioPcOrigenAnterior: string | null;
      anioPcOrigenNuevo: string;
      actualizado: boolean;
    }> = [];

    for (const equipo of equipos) {
      const calculo = calcularAnioPcDesdeSerial(
        equipo.serial,
        equipo.marca,
        equipo.modelo,
        equipo.procesador
      );

      const anioPcNuevo = calculo.anioPc;
      const anioPcOrigenNuevo = calculo.anioPcOrigen;

      const cambio =
        equipo.anioPc !== anioPcNuevo ||
        equipo.anioPcOrigen !== anioPcOrigenNuevo;

      if (!cambio) {
        sinCambios++;

        resultados.push({
          id_equipo: equipo.id_equipo,
          serial: equipo.serial,
          marca: equipo.marca,
          anioPcAnterior: equipo.anioPc,
          anioPcNuevo,
          anioPcOrigenAnterior: equipo.anioPcOrigen,
          anioPcOrigenNuevo,
          actualizado: false,
        });

        continue;
      }

      await prisma.equipo.update({
        where: {
          id_equipo: equipo.id_equipo,
        },
        data: {
          anioPc: anioPcNuevo,
          anioPcOrigen: anioPcOrigenNuevo,
        },
      });

      if (anioPcNuevo) {
        actualizados++;
      } else {
        noDeterminados++;
      }

      resultados.push({
        id_equipo: equipo.id_equipo,
        serial: equipo.serial,
        marca: equipo.marca,
        anioPcAnterior: equipo.anioPc,
        anioPcNuevo,
        anioPcOrigenAnterior: equipo.anioPcOrigen,
        anioPcOrigenNuevo,
        actualizado: true,
      });
    }

    clearCache();

    return res.json({
      ok: true,
      totalProcesados: equipos.length,
      actualizados,
      noDeterminados,
      sinCambios,
      resultados,
    });
  } catch (err) {
    console.error("recalcularAnioPcEquipos error:", err);

    if (err instanceof z.ZodError) {
      return res.status(400).json({
        error: "Datos inválidos",
        details: err.flatten(),
      });
    }

    return res.status(500).json({
      error: "Error al recalcular año PC de equipos existentes",
    });
  }
}