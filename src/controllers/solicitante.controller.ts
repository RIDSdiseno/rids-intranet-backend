// src/controllers/solicitantes.controller.ts
import type { Request, Response } from "express";
import { prisma } from "../lib/prisma.js";
import type { Prisma } from "@prisma/client";

export const listSolicitantes = async (req: Request, res: Response) => {
  console.log("[solicitantes] entro al controller con userId:", (req as any).userId);

  const q = (req.query.q as string | undefined)?.trim();
  const page = Math.max(1, Number(req.query.page ?? 1));
  const pageSize = Math.min(100, Math.max(1, Number(req.query.pageSize ?? 10)));
  const skip = (page - 1) * pageSize;

  let empresaIds: number[] = [];
  if (q) {
    const empresas = await prisma.empresa.findMany({
      where: { nombre: { contains: q, mode: "insensitive" } },
      select: { id_empresa: true },
    });
    empresaIds = empresas.map(e => e.id_empresa);
  }

  const or: Prisma.SolicitanteWhereInput[] = [];
  if (q) {
    or.push({ nombre: { contains: q, mode: "insensitive" } });
    if (empresaIds.length > 0) or.push({ empresaId: { in: empresaIds } });
  }
  const where: Prisma.SolicitanteWhereInput = or.length ? { OR: or } : {};

  const [total, baseSolicitantes] = await Promise.all([
    prisma.solicitante.count({ where }),
    prisma.solicitante.findMany({
      where,
      skip,
      take: pageSize,
      orderBy: [{ id_solicitante: "asc" }],
      select: { id_solicitante: true, nombre: true, empresaId: true },
    }),
  ]);

  const empresaIdSet = new Set(baseSolicitantes.map(s => s.empresaId));
  const solicitanteIdSet = new Set(baseSolicitantes.map(s => s.id_solicitante));

  const [empresas, equipos] = await Promise.all([
    prisma.empresa.findMany({
      where: { id_empresa: { in: Array.from(empresaIdSet) } },
      select: { id_empresa: true, nombre: true },
    }),
    prisma.equipo.findMany({
      where: { idSolicitante: { in: Array.from(solicitanteIdSet) } },
      select: {
        id_equipo: true,
        idSolicitante: true,
        serial: true,
        marca: true,
        modelo: true,
        procesador: true,
        ram: true,
        disco: true,
        propiedad: true,
      },
      orderBy: { id_equipo: "asc" },
    }),
  ]);

  const empresaMap = new Map(empresas.map(e => [e.id_empresa, e]));
  const equiposBySolic = new Map<number, typeof equipos>();
  for (const eq of equipos) {
    const list = equiposBySolic.get(eq.idSolicitante) ?? [];
    list.push(eq);
    equiposBySolic.set(eq.idSolicitante, list);
  }

  const items = baseSolicitantes.map(s => ({
    ...s,
    empresa: empresaMap.get(s.empresaId) ?? null,
    equipos: equiposBySolic.get(s.id_solicitante) ?? [],
  }));

  return res.json({
    page,
    pageSize,
    total,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
    items,
  });
};
