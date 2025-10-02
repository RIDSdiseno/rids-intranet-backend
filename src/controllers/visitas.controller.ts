// src/controllers/visitas.controller.ts
import type { Request, Response } from "express";
import type { Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma.js";

/**
 * Listado paginado + filtros
 */
export const listVisitas = async (req: Request, res: Response) => {
  const page = Math.max(1, Number(req.query.page ?? 1));
  const pageSize = Math.min(100, Math.max(1, Number(req.query.pageSize ?? 10)));

  const tecnicoIdQ = req.query.tecnicoId as string | undefined;
  const empresaIdQ = req.query.empresaId as string | undefined;
  const statusQ = req.query.status as string | undefined; // filtro opcional
  const q = (req.query.q as string | undefined)?.trim();

  const INS: Prisma.QueryMode = "insensitive";

  const where: Prisma.VisitaWhereInput = {
    ...(tecnicoIdQ ? { tecnicoId: Number(tecnicoIdQ) } : {}),
    ...(empresaIdQ ? { empresaId: Number(empresaIdQ) } : {}),
    ...(statusQ ? { status: statusQ as any } : {}), // si quieres valida con Zod el enum
    ...(q
      ? {
          OR: [
            { solicitante: { contains: q, mode: INS } },
            { otrosDetalle: { contains: q, mode: INS } },
            { empresa: { is: { nombre: { contains: q, mode: INS } } } },
            { tecnico: { is: { nombre: { contains: q, mode: INS } } } },
            { solicitanteRef: { is: { nombre: { contains: q, mode: INS } } } },
          ] satisfies Prisma.VisitaWhereInput[],
        }
      : {}),
  };

  const [total, rows] = await Promise.all([
    prisma.visita.count({ where }),
    prisma.visita.findMany({
      where,
      skip: (page - 1) * pageSize,
      take: pageSize,
      orderBy: [{ inicio: "desc" }],
      // ⚠️ select explícito para no pedir campos eliminados
      select: {
        id_visita: true,
        empresaId: true,
        tecnicoId: true,
        solicitante: true,
        inicio: true,
        fin: true,
        confImpresoras: true,
        confTelefonos: true,
        confPiePagina: true,
        otros: true,
        otrosDetalle: true,
        status: true,
        solicitanteId: true,
        actualizaciones: true,
        antivirus: true,
        ccleaner: true,
        estadoDisco: true,
        licenciaOffice: true,
        licenciaWindows: true,
        mantenimientoReloj: true,
        rendimientoEquipo: true,
        empresa: { select: { id_empresa: true, nombre: true } },
        tecnico: { select: { id_tecnico: true, nombre: true } },
        solicitanteRef: { select: { id_solicitante: true, nombre: true } },
      },
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

/**
 * Métricas por rango (from/to): total y agrupado por técnico.
 */
export const getVisitasMetrics = async (req: Request, res: Response) => {
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

    const total = await prisma.visita.count({
      where: { inicio: { gte: from, lt: to } },
    });

    const grouped = await prisma.visita.groupBy({
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
    console.error("[visitas.metrics] error:", err);
    return res
      .status(500)
      .json({ error: "No se pudieron obtener métricas de visitas" });
  }
};

/**
 * Métricas por rango (from/to): total, por técnico y desglose por empresa.
 */
export const visitasMetrics = async (req: Request, res: Response) => {
  const from = new Date(`${req.query.from as string}T00:00:00`);
  const to = new Date(`${req.query.to as string}T00:00:00`);

  const total = await prisma.visita.count({
    where: { inicio: { gte: from, lt: to } },
  });

  const rows = await prisma.visita.groupBy({
    by: ["tecnicoId"],
    where: { inicio: { gte: from, lt: to } },
    _count: { _all: true },
  });

  const tecnicos = await prisma.tecnico.findMany({
    where: { id_tecnico: { in: rows.map((r) => r.tecnicoId) } },
    select: { id_tecnico: true, nombre: true },
  });
  const techMap = new Map(tecnicos.map((t) => [t.id_tecnico, t.nombre]));

  const porTecnicoEmpresaRaw = await prisma.visita.groupBy({
    by: ["tecnicoId", "empresaId"],
    where: { inicio: { gte: from, lt: to } },
    _count: { _all: true },
  });

  const empresas = await prisma.empresa.findMany({
    where: { id_empresa: { in: porTecnicoEmpresaRaw.map((r) => r.empresaId) } },
    select: { id_empresa: true, nombre: true },
  });
  const empresaMap = new Map(empresas.map((e) => [e.id_empresa, e.nombre]));

  const empresasByTech = new Map<
    number,
    { empresaId: number; empresa: string; cantidad: number }[]
  >();

  for (const r of porTecnicoEmpresaRaw) {
    const list = empresasByTech.get(r.tecnicoId) ?? [];
    list.push({
      empresaId: r.empresaId,
      empresa: empresaMap.get(r.empresaId) ?? `Empresa ${r.empresaId}`,
      cantidad: r._count._all,
    });
    empresasByTech.set(r.tecnicoId, list);
  }

  const porTecnico = rows
    .map((r) => ({
      tecnicoId: r.tecnicoId,
      tecnico: techMap.get(r.tecnicoId) ?? `Técnico ${r.tecnicoId}`,
      cantidad: r._count._all,
      empresas: (empresasByTech.get(r.tecnicoId) ?? []).sort(
        (a, b) => b.cantidad - a.cantidad
      ),
    }))
    .sort((a, b) => b.cantidad - a.cantidad);

  res.json({ total, porTecnico });
};

/**
 * Listas para filtros (combos) de visitas: técnicos y empresas.
 */
export const getVisitasFilters = async (_req: Request, res: Response) => {
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
