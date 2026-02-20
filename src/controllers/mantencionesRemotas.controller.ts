// src/controllers/mantencionesRemotas.controller.ts
import type { Request, Response } from "express";
import type { Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma.js";
import { z } from "zod";

/* ------------------------------------ */
/* Select                                */
/* ------------------------------------ */

const mantencionSelect = {
  id_mantencion: true,
  empresaId: true,
  tecnicoId: true,
  solicitante: true,
  inicio: true,
  fin: true,

  soporteRemoto: true,
  actualizaciones: true,
  antivirus: true,
  ccleaner: true,
  estadoDisco: true,
  licenciaOffice: true,
  licenciaWindows: true,
  optimizacion: true,
  respaldo: true,
  otros: true,
  otrosDetalle: true,

  status: true,
  solicitanteId: true,

  empresa: { select: { id_empresa: true, nombre: true } },
  tecnico: { select: { id_tecnico: true, nombre: true } },
  solicitanteRef: { select: { id_solicitante: true, nombre: true } },
} as const;

const StatusEnum = z.enum(["PENDIENTE", "COMPLETADA", "CANCELADA"]);

const baseFlags = z.object({
  soporteRemoto: z.boolean().optional().default(true),
  actualizaciones: z.boolean().optional().default(false),
  antivirus: z.boolean().optional().default(false),
  ccleaner: z.boolean().optional().default(false),
  estadoDisco: z.boolean().optional().default(false),
  licenciaOffice: z.boolean().optional().default(false),
  licenciaWindows: z.boolean().optional().default(false),
  optimizacion: z.boolean().optional().default(false),
  respaldo: z.boolean().optional().default(false),
  otros: z.boolean().optional().default(false),
  otrosDetalle: z.string().trim().optional().nullable(),
});

/**
 * Regla:
 * - Uno: solicitanteId? / solicitante?
 * - Lote: solicitantesIds? / solicitantesNombres?
 */
const CreateMantencionSchema = z
  .object({
    empresaId: z.number().int().positive(),
    tecnicoId: z.number().int().positive(),

    solicitanteId: z.number().int().positive().optional(),
    solicitante: z.string().trim().optional(),

    solicitantesIds: z.array(z.number().int().positive()).optional(),
    solicititantesNombres: z.array(z.string().trim().min(1)).optional(), // typo safe alias (si viene mal)
    solicitantesNombres: z.array(z.string().trim().min(1)).optional(),

    inicio: z.coerce.date(),
    fin: z.coerce.date().optional().nullable(),
    status: StatusEnum.optional().default("PENDIENTE"),
  })
  .extend(baseFlags.shape)
  .superRefine((d, ctx) => {
    const nombres = d.solicitantesNombres ?? d.solicititantesNombres; // acepta ambas
    const hasBatch =
      (d.solicitantesIds && d.solicitantesIds.length > 0) ||
      (nombres && nombres.length > 0);

    const hasSingle =
      !!d.solicitanteId || (d.solicitante && d.solicitante.trim().length > 0);

    if (!hasBatch && !hasSingle) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          "Debes enviar: (solicitanteId o solicitante) o (solicitantesIds/solicitantesNombres).",
        path: ["solicitante"],
      });
    }
  });

const UpdateMantencionSchema = z
  .object({
    empresaId: z.number().int().positive().optional(),
    tecnicoId: z.number().int().positive().optional(),
    solicitanteId: z.number().int().positive().optional(),
    solicitante: z.string().trim().optional(),
    inicio: z.coerce.date().optional(),
    fin: z.coerce.date().optional().nullable(),
    status: StatusEnum.optional(),
  })
  .extend(baseFlags.partial().shape);

const parseId = (raw: unknown) => {
  const n = Number(raw);
  return Number.isInteger(n) && n > 0 ? n : null;
};

const parsePositiveInt = (raw: unknown) => {
  const n = Number(raw);
  return Number.isInteger(n) && n > 0 ? n : null;
};

/* ------------------------------------ */
/* Listado paginado + filtros            */
/* ------------------------------------ */

export const listMantencionesRemotas = async (req: Request, res: Response) => {
  const page = Math.max(1, Number(req.query.page ?? 1));
  const pageSize = Math.min(100, Math.max(1, Number(req.query.pageSize ?? 10)));

  const tecnicoIdN = parsePositiveInt(req.query.tecnicoId);
  const empresaIdQ = req.query.empresaId as string | undefined;
  const statusQ = (req.query.status as string | undefined)?.trim();
  const q = (req.query.q as string | undefined)?.trim();

  const monthN = Number(req.query.month);
  const yearN = Number(req.query.year);

  let dateFilter: Prisma.DateTimeFilter | undefined;

  if (
    Number.isFinite(monthN) &&
    Number.isFinite(yearN) &&
    monthN >= 1 &&
    monthN <= 12
  ) {
    const from = new Date(yearN, monthN - 1, 1, 0, 0, 0, 0);
    const to = new Date(yearN, monthN, 1, 0, 0, 0, 0);
    dateFilter = { gte: from, lt: to };
  }

  const INS: Prisma.QueryMode = "insensitive";
  const user = (req as any).user as { rol?: string; empresaId?: number | null };

  const empresaIdFilter =
    user?.rol === "CLIENTE"
      ? parsePositiveInt(user.empresaId)
      : empresaIdQ
        ? parsePositiveInt(empresaIdQ)
        : null;

  const where: Prisma.MantencionRemotaWhereInput = {
    ...(empresaIdFilter ? { empresaId: empresaIdFilter } : {}),
    ...(tecnicoIdN ? { tecnicoId: tecnicoIdN } : {}),
    ...(statusQ ? { status: statusQ as any } : {}),
    ...(dateFilter ? { inicio: dateFilter } : {}),
    ...(q
      ? {
          OR: [
            { solicitante: { contains: q, mode: INS } },
            { otrosDetalle: { contains: q, mode: INS } },
            { empresa: { is: { nombre: { contains: q, mode: INS } } } },
            { tecnico: { is: { nombre: { contains: q, mode: INS } } } },
            { solicitanteRef: { is: { nombre: { contains: q, mode: INS } } } },
          ] satisfies Prisma.MantencionRemotaWhereInput[],
        }
      : {}),
  };

  const [total, rows] = await Promise.all([
    prisma.mantencionRemota.count({ where }),
    prisma.mantencionRemota.findMany({
      where,
      skip: (page - 1) * pageSize,
      take: pageSize,
      orderBy: [{ inicio: "desc" }],
      select: mantencionSelect,
    }),
  ]);

  return res.json({
    page,
    pageSize,
    total,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
    items: rows,
  });
};

/* ------------------------------------ */
/* Get por ID                            */
/* ------------------------------------ */

export const getMantencionRemotaById = async (req: Request, res: Response) => {
  const id = parseId(req.params.id);
  if (!id) return res.status(400).json({ error: "id inválido" });

  const row = await prisma.mantencionRemota.findUnique({
    where: { id_mantencion: id },
    select: mantencionSelect,
  });

  if (!row) return res.status(404).json({ error: "Mantención no encontrada" });

  const user = (req as any).user as { rol?: string; empresaId?: number | null };
  if (user?.rol === "CLIENTE" && row.empresaId !== Number(user.empresaId)) {
    return res.status(403).json({ error: "No autorizado" });
  }

  return res.json(row);
};

/* ------------------------------------ */
/* Crear (single o lote)                 */
/* ------------------------------------ */

export const createMantencionRemota = async (req: Request, res: Response) => {
  try {
    const payloadRaw = CreateMantencionSchema.parse(req.body);

    // soporta ambos nombres si vino el typo
    const payload = {
      ...payloadRaw,
      solicitantesNombres:
        payloadRaw.solicitantesNombres ?? payloadRaw.solicititantesNombres,
    };

    const user = (req as any).user as { rol?: string; empresaId?: number | null };

    const empresaIdFinal: number =
      user?.rol === "CLIENTE"
        ? Number(user.empresaId)
        : payload.empresaId;

    if (!Number.isFinite(empresaIdFinal) || empresaIdFinal <= 0) {
      return res.status(400).json({ error: "empresaId inválido" });
    }

    const isBatch =
      (payload.solicitantesIds && payload.solicitantesIds.length > 0) ||
      (payload.solicitantesNombres && payload.solicitantesNombres.length > 0);

    const commonData = {
      empresaId: empresaIdFinal,
      tecnicoId: payload.tecnicoId,
      inicio: payload.inicio,
      fin: payload.fin ?? null,
      status: payload.status,

      soporteRemoto: !!payload.soporteRemoto,
      actualizaciones: !!payload.actualizaciones,
      antivirus: !!payload.antivirus,
      ccleaner: !!payload.ccleaner,
      estadoDisco: !!payload.estadoDisco,
      licenciaOffice: !!payload.licenciaOffice,
      licenciaWindows: !!payload.licenciaWindows,
      optimizacion: !!payload.optimizacion,
      respaldo: !!payload.respaldo,
      otros: !!payload.otros,
      otrosDetalle: payload.otros ? (payload.otrosDetalle ?? null) : null,
    }

    if (!isBatch) {
      let solicitante = payload.solicitante?.trim();
      let solicitanteId: number | null = payload.solicitanteId ?? null;

      if (!solicitante && solicitanteId) {
        const s = await prisma.solicitante.findUnique({
          where: { id_solicitante: solicitanteId },
          select: { nombre: true },
        });
        if (!s) return res.status(400).json({ error: "solicitanteId no existe" });
        solicitante = s.nombre;
      }

      if (!solicitante) {
        return res.status(400).json({
          error: "Debe indicar 'solicitante' o 'solicitanteId' válido",
        });
      }

      const created = await prisma.mantencionRemota.create({
        data: { ...commonData, solicitanteId, solicitante },
        select: mantencionSelect,
      });

      return res.status(201).json(created);
    }

    // ===== MODO LOTE =====
    let resolvedFromIds: Array<{ solicitanteId: number; solicitante: string }> = [];

    if (payload.solicitantesIds?.length) {
      const rows = await prisma.solicitante.findMany({
        where: { id_solicitante: { in: payload.solicitantesIds } },
        select: { id_solicitante: true, nombre: true },
      });

      const foundIds = new Set(rows.map((r) => r.id_solicitante));
      const missing = payload.solicitantesIds.filter((id) => !foundIds.has(id));

      if (missing.length) {
        return res.status(400).json({
          error: "Algunos solicitantesId no existen",
          missing,
        });
      }

      resolvedFromIds = rows.map((r) => ({
        solicitanteId: r.id_solicitante,
        solicitante: r.nombre,
      }));
    }

    const fromNames: Array<{ solicitanteId: number | null; solicitante: string }> =
      (payload.solicitantesNombres ?? [])
        .map((n) => n.trim())
        .filter((n) => n.length > 0)
        .map((n) => ({ solicitanteId: null, solicitante: n }));

    const allTargets: Array<{ solicitanteId: number | null; solicitante: string }> =
      [];
    const seen = new Set<string>();

    for (const r of [...resolvedFromIds, ...fromNames]) {
      const key = `${r.solicitanteId ?? "null"}|${r.solicitante.toLowerCase()}`;
      if (!seen.has(key)) {
        seen.add(key);
        allTargets.push(r);
      }
    }

    if (allTargets.length === 0) {
      return res.status(400).json({
        error: "No hay solicitantes válidos para crear mantenciones",
      });
    }

    const createdList = await prisma.$transaction(
      allTargets.map((t) =>
        prisma.mantencionRemota.create({
          data: {
            ...commonData,
            solicitanteId: t.solicitanteId,
            solicitante: t.solicitante,
          },
          select: mantencionSelect,
        })
      )
    );

    return res
      .status(201)
      .json({ createdCount: createdList.length, mantenciones: createdList });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return res.status(400).json({ error: "Datos inválidos", details: err.flatten() });
    }
    console.error("[mantencionesRemotas.create] error:", err);
    return res.status(500).json({ error: "No se pudo crear la(s) mantención(es)" });
  }
};

/* ------------------------------------ */
/* Actualizar                            */
/* ------------------------------------ */

export const updateMantencionRemota = async (req: Request, res: Response) => {
  const id = parseId(req.params.id);
  if (!id) return res.status(400).json({ error: "id inválido" });

  try {
    const payload = UpdateMantencionSchema.parse(req.body);
    const user = (req as any).user as { rol?: string; empresaId?: number | null };

    // Si es cliente, validar pertenencia y bloquear cambios peligrosos
    if (user?.rol === "CLIENTE") {
      const current = await prisma.mantencionRemota.findUnique({
        where: { id_mantencion: id },
        select: { empresaId: true },
      });

      if (!current) return res.status(404).json({ error: "Mantención no encontrada" });
      if (current.empresaId !== Number(user.empresaId)) {
        return res.status(403).json({ error: "No autorizado" });
      }

      // No permitir cambiar empresaId
      (payload as any).empresaId = undefined;
    }

    let solicitanteToSet = payload.solicitante;
    if (payload.solicitanteId !== undefined && solicitanteToSet === undefined) {
      const s = await prisma.solicitante.findUnique({
        where: { id_solicitante: payload.solicitanteId },
        select: { nombre: true },
      });
      if (!s) return res.status(400).json({ error: "solicitanteId no existe" });
      solicitanteToSet = s.nombre;
    }

    const otrosDetalle =
      payload.otros === undefined
        ? payload.otrosDetalle
        : payload.otros
          ? payload.otrosDetalle ?? null
          : null;

    const updated = await prisma.mantencionRemota.update({
      where: { id_mantencion: id },
      data: {
        ...(payload.empresaId !== undefined ? { empresaId: payload.empresaId } : {}),
        ...(payload.tecnicoId !== undefined ? { tecnicoId: payload.tecnicoId } : {}),
        ...(payload.solicitanteId !== undefined ? { solicitanteId: payload.solicitanteId } : {}),
        ...(solicitanteToSet !== undefined ? { solicitante: solicitanteToSet } : {}),
        ...(payload.inicio !== undefined ? { inicio: payload.inicio } : {}),
        ...(payload.fin !== undefined ? { fin: payload.fin } : {}),
        ...(payload.status !== undefined ? { status: payload.status } : {}),

        ...(payload.soporteRemoto !== undefined ? { soporteRemoto: !!payload.soporteRemoto } : {}),
        ...(payload.actualizaciones !== undefined ? { actualizaciones: !!payload.actualizaciones } : {}),
        ...(payload.antivirus !== undefined ? { antivirus: !!payload.antivirus } : {}),
        ...(payload.ccleaner !== undefined ? { ccleaner: !!payload.ccleaner } : {}),
        ...(payload.estadoDisco !== undefined ? { estadoDisco: !!payload.estadoDisco } : {}),
        ...(payload.licenciaOffice !== undefined ? { licenciaOffice: !!payload.licenciaOffice } : {}),
        ...(payload.licenciaWindows !== undefined ? { licenciaWindows: !!payload.licenciaWindows } : {}),
        ...(payload.optimizacion !== undefined ? { optimizacion: !!payload.optimizacion } : {}),
        ...(payload.respaldo !== undefined ? { respaldo: !!payload.respaldo } : {}),
        ...(payload.otros !== undefined ? { otros: !!payload.otros } : {}),
        ...(otrosDetalle !== undefined ? { otrosDetalle } : {}),
      },
      select: mantencionSelect,
    });

    return res.json(updated);
  } catch (err: any) {
    if (err instanceof z.ZodError) {
      return res.status(400).json({ error: "Datos inválidos", details: err.flatten() });
    }
    if (err?.code === "P2025") {
      return res.status(404).json({ error: "Mantención no encontrada" });
    }
    console.error("[mantencionesRemotas.update] error:", err);
    return res.status(500).json({ error: "No se pudo actualizar la mantención" });
  }
};

/* ------------------------------------ */
/* Eliminar                              */
/* ------------------------------------ */

export const deleteMantencionRemota = async (req: Request, res: Response) => {
  const id = parseId(req.params.id);
  if (!id) return res.status(400).json({ error: "id inválido" });

  try {
    await prisma.mantencionRemota.delete({ where: { id_mantencion: id } });
    return res.status(204).send();
  } catch (err: any) {
    if (err?.code === "P2025") {
      return res.status(404).json({ error: "Mantención no encontrada" });
    }
    console.error("[mantencionesRemotas.delete] error:", err);
    return res.status(500).json({ error: "No se pudo eliminar la mantención" });
  }
};

/* ------------------------------------ */
/* Acciones rápidas                      */
/* ------------------------------------ */

export const closeMantencionRemota = async (req: Request, res: Response) => {
  const id = parseId(req.params.id);
  if (!id) return res.status(400).json({ error: "id inválido" });

  try {
    const updated = await prisma.mantencionRemota.update({
      where: { id_mantencion: id },
      data: { status: "COMPLETADA", fin: new Date() },
      select: mantencionSelect,
    });
    return res.json(updated);
  } catch (err: any) {
    if (err?.code === "P2025") {
      return res.status(404).json({ error: "Mantención no encontrada" });
    }
    console.error("[mantencionesRemotas.close] error:", err);
    return res.status(500).json({ error: "No se pudo cerrar la mantención" });
  }
};

/* ------------------------------------ */
/* Métricas                              */
/* ------------------------------------ */

export const mantencionesRemotasMetrics = async (req: Request, res: Response) => {
  try {
    const fromQ = (req.query.from as string | undefined)?.trim();
    const toQ = (req.query.to as string | undefined)?.trim();

    const now = new Date();
    const y = now.getFullYear();
    const m = now.getMonth();
    const startDefault = new Date(y, m, 1);
    const endDefault = new Date(y, m + 1, 1);

    const from = fromQ ? new Date(fromQ) : startDefault;
    const to = toQ ? new Date(toQ) : endDefault;

    const total = await prisma.mantencionRemota.count({
      where: { inicio: { gte: from, lt: to } },
    });

    const grouped = await prisma.mantencionRemota.groupBy({
      by: ["tecnicoId"],
      where: { inicio: { gte: from, lt: to } },
      _count: { _all: true },
    });

    const tecnicoIds = grouped.map((g) => g.tecnicoId);
    const tecnicos = tecnicoIds.length
      ? await prisma.tecnico.findMany({
          where: { id_tecnico: { in: tecnicoIds } },
          select: { id_tecnico: true, nombre: true },
        })
      : [];

    const nameById = new Map(tecnicos.map((t) => [t.id_tecnico, t.nombre]));
    const porTecnico = grouped
      .map((g) => ({
        tecnicoId: g.tecnicoId,
        tecnico: nameById.get(g.tecnicoId) ?? `Técnico ${g.tecnicoId}`,
        cantidad: g._count._all,
      }))
      .sort((a, b) => b.cantidad - a.cantidad);

    return res.json({ total, porTecnico });
  } catch (err) {
    console.error("[mantencionesRemotas.metrics] error:", err);
    return res.status(500).json({ error: "No se pudieron obtener métricas" });
  }
};

export const getMantencionesRemotasFilters = async (_req: Request, res: Response) => {
  const [tecnicos, empresas] = await Promise.all([
    prisma.tecnico.findMany({
      orderBy: { nombre: "asc" },
      select: { id_tecnico: true, nombre: true },
    }),
    prisma.empresa.findMany({
      orderBy: { nombre: "asc" },
      select: { id_empresa: true, nombre: true },
    }),
  ]);

  res.json({
    tecnicos: tecnicos.map((t) => ({ id: t.id_tecnico, nombre: t.nombre })),
    empresas: empresas.map((e) => ({ id: e.id_empresa, nombre: e.nombre })),
  });
};