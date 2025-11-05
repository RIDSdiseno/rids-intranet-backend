// controllers/solicitantes.controller.ts
import type { Request, Response } from "express";
import { prisma } from "../lib/prisma.js";
import { AccountType, type Prisma } from "@prisma/client";

/* Utils */
const toInt = (v: unknown, def = 0) => {
  const n = Number(v);
  return Number.isFinite(n) && Number.isInteger(n) ? n : def;
};
const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

type OrderByKey = "empresa" | "nombre" | "id";
type OrderDir = "asc" | "desc";

const parseOrderBy = (v: unknown): OrderByKey => {
  const s = String(v ?? "").toLowerCase();
  if (s === "nombre") return "nombre";
  if (s === "id" || s === "ids" || s === "id_solicitante") return "id";
  return "empresa"; // default
};
const parseOrderDir = (v: unknown): OrderDir => (String(v ?? "").toLowerCase() === "desc" ? "desc" : "asc");

/** Orden estable por empresa.nombre / nombre / id */
const buildSolicitanteOrderBy = (
  orderByKey: OrderByKey,
  orderDir: OrderDir
): Prisma.SolicitanteOrderByWithRelationInput[] => {
  if (orderByKey === "nombre") return [{ nombre: orderDir }, { id_solicitante: "asc" }];
  if (orderByKey === "id") return [{ id_solicitante: orderDir }];
  return [{ empresa: { nombre: orderDir } }, { nombre: "asc" }, { id_solicitante: "asc" }];
};

/* ============================================================
 * GET /solicitantes
 * ============================================================ */
export const listSolicitantes = async (req: Request, res: Response) => {
  try {
    const q = (req.query.q as string | undefined)?.trim();
    const empresaId = toInt(req.query.empresaId);
    const page = clamp(toInt(req.query.page, 1), 1, 1_000_000);
    const pageSize = clamp(toInt(req.query.pageSize, 10), 1, 100);
    const onlyGMS =
      String(req.query.onlyGMS ?? "").toLowerCase() === "1" ||
      String(req.query.onlyGMS ?? "").toLowerCase() === "true";
    const includeMsDetails =
      String(req.query.includeMsDetails ?? "").toLowerCase() === "1" ||
      String(req.query.includeMsDetails ?? "").toLowerCase() === "true";

    const skip = (page - 1) * pageSize;

    const orderByKey = parseOrderBy(req.query.orderBy);
    const orderDir = parseOrderDir(req.query.orderDir);

    const INS: Prisma.QueryMode = "insensitive";
    const where: Prisma.SolicitanteWhereInput = {
      ...(empresaId > 0 ? { empresaId } : {}),
      ...(q
        ? {
            OR: [
              { nombre: { contains: q, mode: INS } },
              { email: { contains: q, mode: INS } },
              { empresa: { is: { nombre: { contains: q, mode: INS } } } }, // relación
            ],
          }
        : {}),
      ...(onlyGMS ? { accountType: { in: [AccountType.google, AccountType.microsoft] } } : {}),
    };

    const orderBy = buildSolicitanteOrderBy(orderByKey, orderDir);

    const [total, baseSolicitantes] = await Promise.all([
      prisma.solicitante.count({ where }),
      prisma.solicitante.findMany({
        where,
        skip,
        take: pageSize,
        orderBy,
        select: {
          id_solicitante: true,
          nombre: true,
          email: true,
          empresaId: true,
          accountType: true,
          googleUserId: true,
          microsoftUserId: true,
        },
      }),
    ]);

    // Enriquecer con empresa, equipos y licencias MS
    const empresaIds = Array.from(
      new Set(baseSolicitantes.map((s) => s.empresaId).filter((x): x is number => typeof x === "number"))
    );
    const solicitanteIds = baseSolicitantes.map((s) => s.id_solicitante);

    const [empresas, equipos, msLinks] = await Promise.all([
      prisma.empresa.findMany({
        where: { id_empresa: { in: empresaIds } },
        select: { id_empresa: true, nombre: true },
      }),
      prisma.equipo.findMany({
        where: { idSolicitante: { in: solicitanteIds } },
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
      prisma.solicitanteMsLicense.findMany({
        where: { solicitanteId: { in: solicitanteIds } },
        select: {
          solicitanteId: true,
          skuId: true,
          sku: { select: { skuId: true, skuPartNumber: true, displayName: true } },
        },
        orderBy: { skuId: "asc" },
      }),
    ]);

    const empresaMap = new Map(empresas.map((e) => [e.id_empresa, e]));
    const equiposBySolic = new Map<number, typeof equipos>();
    for (const eq of equipos) {
      const list = equiposBySolic.get(eq.idSolicitante) ?? [];
      list.push(eq);
      equiposBySolic.set(eq.idSolicitante, list);
    }

    type MsLic = { skuId: string; skuPartNumber: string; displayName?: string };
    const msBySolic = new Map<number, MsLic[]>();
    for (const l of msLinks) {
      const list = msBySolic.get(l.solicitanteId) ?? [];
      list.push({
        skuId: l.skuId,
        skuPartNumber: l.sku?.skuPartNumber ?? l.skuId,
        ...(l.sku?.displayName ? { displayName: l.sku.displayName } : {}),
      });
      msBySolic.set(l.solicitanteId, list);
    }

    const items = baseSolicitantes.map((s) => {
      const fullLic = msBySolic.get(s.id_solicitante) ?? [];
      return {
        ...s,
        empresa: s.empresaId ? empresaMap.get(s.empresaId) ?? null : null,
        equipos: equiposBySolic.get(s.id_solicitante) ?? [],
        msLicensesCount: fullLic.length,
        ...(includeMsDetails ? { msLicenses: fullLic } : {}),
      };
    });

    return res.json({
      page,
      pageSize,
      total,
      totalPages: Math.max(1, Math.ceil(total / pageSize)),
      items,
    });
  } catch (err: unknown) {
    console.error("[solicitantes.list] error:", err);
    return res.status(500).json({ error: "No se pudieron listar los solicitantes" });
  }
};

/* ============================================================
 * GET /solicitantes/by-empresa
 * ============================================================ */
export const listSolicitantesByEmpresa = async (req: Request, res: Response) => {
  try {
    const empresaId = toInt(req.query.empresaId);
    if (empresaId <= 0) {
      return res.status(400).json({ error: "empresaId requerido y debe ser entero > 0" });
    }
    const q = (req.query.q as string | undefined)?.trim();
    const orderByKey = parseOrderBy(req.query.orderBy);
    const orderDir = parseOrderDir(req.query.orderDir);

    const where: Prisma.SolicitanteWhereInput = {
      empresaId,
      ...(q ? { nombre: { contains: q, mode: "insensitive" } } : {}),
    };

    const rows = await prisma.solicitante.findMany({
      where,
      orderBy: buildSolicitanteOrderBy(orderByKey, orderDir),
      select: { id_solicitante: true, nombre: true },
    });

    return res.json({ items: rows.map((s) => ({ id: s.id_solicitante, nombre: s.nombre })) });
  } catch (err: unknown) {
    console.error("[solicitantes.byEmpresa] error:", err);
    return res.status(500).json({ error: "No se pudieron obtener solicitantes por empresa" });
  }
};

/* ============================================================
 * GET /solicitantes/select
 * ============================================================ */
export const listSolicitantesForSelect = async (req: Request, res: Response) => {
  try {
    const orderByKey = parseOrderBy(req.query.orderBy);
    const orderDir = parseOrderDir(req.query.orderDir);
    const empresaId = toInt(req.query.empresaId);
    const includeEmpresa = String(req.query.includeEmpresa ?? "").toLowerCase() === "true";
    const q = (req.query.q as string | undefined)?.trim();

    const limit = clamp(toInt(req.query.limit, 100), 1, 500);

    const INS: Prisma.QueryMode = "insensitive";
    const where: Prisma.SolicitanteWhereInput = {
      ...(empresaId > 0 ? { empresaId } : {}),
      ...(q
        ? {
            OR: [
              { nombre: { contains: q, mode: INS } },
              { email: { contains: q, mode: INS } },
              { empresa: { is: { nombre: { contains: q, mode: INS } } } },
            ],
          }
        : {}),
    };

    const rows = await prisma.solicitante.findMany({
      where,
      take: limit,
      orderBy: buildSolicitanteOrderBy(orderByKey, orderDir),
      select: {
        id_solicitante: true,
        nombre: true,
        empresa: { select: { nombre: true } },
      },
    });

    const items = rows.map((r) => {
      const empresaNombre = r.empresa?.nombre ?? null;
      const text = includeEmpresa && empresaNombre ? `${r.nombre} — ${empresaNombre}` : r.nombre;
      return { value: r.id_solicitante, text, id: r.id_solicitante, nombre: r.nombre, empresaNombre };
    });

    return res.json({ items });
  } catch (err: unknown) {
    console.error("[solicitantes.select] error:", err);
    return res.status(500).json({ error: "No se pudo obtener el listado para select" });
  }
};

/* ============================================================
 * GET /solicitantes/metrics  (optimizado)
 * ============================================================ */
export const solicitantesMetrics = async (req: Request, res: Response) => {
  try {
    const q = (req.query.q as string | undefined)?.trim();
    const empresaId = toInt(req.query.empresaId);

    const INS: Prisma.QueryMode = "insensitive";
    const where: Prisma.SolicitanteWhereInput = {
      ...(empresaId > 0 ? { empresaId } : {}),
      ...(q
        ? {
            OR: [
              { nombre: { contains: q, mode: INS } },
              { email: { contains: q, mode: INS } },
              { empresa: { is: { nombre: { contains: q, mode: INS } } } },
            ],
          }
        : {}),
    };

    const [solicitantes, empresasGroup, equipos] = await Promise.all([
      prisma.solicitante.count({ where }),
      prisma.solicitante.groupBy({ by: ["empresaId"], where, _count: { empresaId: true } }),
      prisma.equipo.count({ where: { solicitante: where } }), // mismo filtro relacional
    ]);

    const empresas = empresasGroup.length;
    return res.json({ solicitantes, empresas, equipos });
  } catch (err: unknown) {
    console.error("[solicitantes.metrics] error:", err);
    return res.status(500).json({ error: "No se pudieron calcular las métricas" });
  }
};

/* ===================== CREATE ===================== */
export const createSolicitante = async (req: Request, res: Response) => {
  try {
    const nombre = String(req.body?.nombre ?? "").trim();
    const email = typeof req.body?.email === "string" ? req.body.email.trim() : null;
    const empresaId = toInt(req.body?.empresaId);

    if (!nombre) return res.status(400).json({ error: "El nombre es obligatorio" });
    if (empresaId <= 0) return res.status(400).json({ error: "empresaId inválido" });

    const empresa = await prisma.empresa.findUnique({
      where: { id_empresa: empresaId },
      select: { id_empresa: true },
    });
    if (!empresa) return res.status(404).json({ error: "La empresa no existe" });

    const created = await prisma.solicitante.create({
      data: { nombre, email, empresaId },
      select: {
        id_solicitante: true,
        nombre: true,
        email: true,
        empresaId: true,
        accountType: true,
        empresa: { select: { id_empresa: true, nombre: true } },
      },
    });

    return res.status(201).json(created);
  } catch (err: unknown) {
    const e = err as { code?: string };
    if (e?.code === "P2002") {
      return res.status(409).json({ error: "Ya existe un solicitante con ese valor único" });
    }
    console.error("[solicitantes.create] error:", err);
    return res.status(500).json({ error: "No se pudo crear el solicitante" });
  }
};

/* ===================== READ ===================== */
export const getSolicitanteById = async (req: Request, res: Response) => {
  try {
    const id = toInt(req.params.id);
    if (id <= 0) return res.status(400).json({ error: "ID inválido" });

    const solicitante = await prisma.solicitante.findUnique({
      where: { id_solicitante: id },
      select: {
        id_solicitante: true,
        nombre: true,
        email: true,
        empresaId: true,
        accountType: true,
        empresa: { select: { id_empresa: true, nombre: true } },
        equipos: {
          select: {
            id_equipo: true,
            serial: true,
            marca: true,
            modelo: true,
            procesador: true,
            ram: true,
            disco: true,
            propiedad: true,
          },
          orderBy: { id_equipo: "asc" },
        },
      },
    });

    if (!solicitante) return res.status(404).json({ error: "No encontrado" });

    const links = await prisma.solicitanteMsLicense.findMany({
      where: { solicitanteId: solicitante.id_solicitante },
      include: { sku: { select: { skuId: true, skuPartNumber: true, displayName: true } } },
      orderBy: { skuId: "asc" },
    });

    type MsLic = { skuId: string; skuPartNumber: string; displayName?: string };
    const msLicenses: MsLic[] = links.map((l) => ({
      skuId: l.skuId,
      skuPartNumber: l.sku?.skuPartNumber ?? l.skuId,
      ...(l.sku?.displayName ? { displayName: l.sku.displayName } : {}),
    }));

    return res.json({ ...solicitante, msLicenses });
  } catch (err: unknown) {
    console.error("[solicitantes.getOne] error:", err);
    return res.status(500).json({ error: "No se pudo obtener el solicitante" });
  }
};

/* ===================== UPDATE ===================== */
export const updateSolicitante = async (req: Request, res: Response) => {
  try {
    const id = toInt(req.params.id);
    if (id <= 0) return res.status(400).json({ error: "ID inválido" });

    const nombre = typeof req.body?.nombre === "string" ? req.body.nombre.trim() : undefined;
    const email =
      req.body?.email === null ? null : typeof req.body?.email === "string" ? req.body.email.trim() : undefined;
    const empresaId = typeof req.body?.empresaId !== "undefined" ? toInt(req.body.empresaId) : undefined;

    if (empresaId !== undefined && empresaId <= 0) {
      return res.status(400).json({ error: "empresaId inválido" });
    }

    const current = await prisma.solicitante.findUnique({
      where: { id_solicitante: id },
      select: { id_solicitante: true },
    });
    if (!current) return res.status(404).json({ error: "No encontrado" });

    if (typeof empresaId === "number") {
      const emp = await prisma.empresa.findUnique({
        where: { id_empresa: empresaId },
        select: { id_empresa: true },
      });
      if (!emp) return res.status(404).json({ error: "La empresa no existe" });
    }

    const updated = await prisma.solicitante.update({
      where: { id_solicitante: id },
      data: {
        ...(nombre !== undefined ? { nombre } : {}),
        ...(email !== undefined ? { email } : {}),
        ...(empresaId !== undefined ? { empresaId } : {}),
      },
      select: {
        id_solicitante: true,
        nombre: true,
        email: true,
        empresaId: true,
        accountType: true,
        empresa: { select: { id_empresa: true, nombre: true } },
      },
    });

    return res.json(updated);
  } catch (err: unknown) {
    const e = err as { code?: string };
    if (e?.code === "P2002") {
      return res.status(409).json({ error: "Conflicto de unicidad (email u otro campo único)" });
    }
    console.error("[solicitantes.update] error:", err);
    return res.status(500).json({ error: "No se pudo actualizar el solicitante" });
  }
};

/* ===================== DELETE ===================== */
export const deleteSolicitante = async (req: Request, res: Response) => {
  try {
    const id = toInt(req.params.id);
    if (id <= 0) return res.status(400).json({ error: "ID inválido" });

    const transferToId = req.query.transferToId ? toInt(req.query.transferToId) : undefined;

    if (transferToId !== undefined) {
      if (transferToId <= 0) return res.status(400).json({ error: "transferToId debe ser entero > 0" });
      if (transferToId === id) return res.status(400).json({ error: "transferToId no puede ser el mismo solicitante" });
    }

    const fallbackParam = String(req.query.fallback ?? "null").toLowerCase();
    const fallback: "null" | "sa" = fallbackParam === "sa" ? "sa" : "null";

    const source = await prisma.solicitante.findUnique({
      where: { id_solicitante: id },
      select: { id_solicitante: true, empresaId: true },
    });
    if (!source) return res.status(404).json({ error: "Solicitante no encontrado" });

    if (transferToId) {
      const dest = await prisma.solicitante.findUnique({
        where: { id_solicitante: transferToId },
        select: { id_solicitante: true },
      });
      if (!dest) return res.status(404).json({ error: "Solicitante destino no existe" });
    }

    const ensureSaSolicitante = async (empresaId: number) => {
      const existing = await prisma.solicitante.findFirst({
        where: { empresaId, nombre: "S/A" },
        select: { id_solicitante: true },
      });
      if (existing) return existing.id_solicitante;

      const created = await prisma.solicitante.create({
        data: { nombre: "S/A", email: null, telefono: null, empresaId },
        select: { id_solicitante: true },
      });
      return created.id_solicitante;
    };

    await prisma.$transaction(async (tx) => {
      if (transferToId) {
        await tx.equipo.updateMany({ where: { idSolicitante: id }, data: { idSolicitante: transferToId } });
        await tx.historial.updateMany({ where: { solicitanteId: id }, data: { solicitanteId: transferToId } });
        await tx.freshdeskRequesterMap.updateMany({
          where: { solicitanteId: id },
          data: { solicitanteId: transferToId },
        });
        await tx.freshdeskTicket.updateMany({
          where: { solicitanteId: id },
          data: { solicitanteId: transferToId },
        });
        await tx.visita.updateMany({ where: { solicitanteId: id }, data: { solicitanteId: transferToId } });
      } else {
        const saId = await ensureSaSolicitante(source.empresaId);

        await tx.equipo.updateMany({ where: { idSolicitante: id }, data: { idSolicitante: saId } });
        await tx.historial.updateMany({ where: { solicitanteId: id }, data: { solicitanteId: saId } });
        await tx.freshdeskRequesterMap.updateMany({
          where: { solicitanteId: id },
          data: { solicitanteId: saId },
        });

        if (fallback === "sa") {
          await tx.freshdeskTicket.updateMany({ where: { solicitanteId: id }, data: { solicitanteId: saId } });
          await tx.visita.updateMany({ where: { solicitanteId: id }, data: { solicitanteId: saId } });
        } else {
          await tx.freshdeskTicket.updateMany({ where: { solicitanteId: id }, data: { solicitanteId: null } });
          await tx.visita.updateMany({ where: { solicitanteId: id }, data: { solicitanteId: null } });
        }
      }

      await tx.solicitante.delete({ where: { id_solicitante: id } });
    });

    return res.json({
      ok: true,
      deletedId: id,
      strategy: transferToId ? { type: "transfer", transferToId } : { type: "fallback-SA", fallback },
    });
  } catch (err: unknown) {
    console.error("[solicitantes.delete] error:", err);
    return res.status(500).json({ error: "No se pudo eliminar el solicitante" });
  }
};
