// controllers/solicitantes.controller.ts
import type { Request, Response } from "express";
import { prisma } from "../lib/prisma.js";
import type { Prisma } from "@prisma/client";

/* Utils */
const toInt = (v: unknown, def = 0) => {
  const n = Number(v);
  return Number.isFinite(n) && Number.isInteger(n) ? n : def;
};
const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

type OrderByKey = "empresa" | "nombre" | "id";
type OrderDir = "asc" | "desc";

/** ✅ Empresas donde los solicitantes pueden ser "boxes" sin cuenta */
const BOX_CLINIC_EMPRESA_IDS = new Set([6, 7, 22, 29, 31]); // Clínica Alameda, Providencia

const parseOrderBy = (v: unknown): OrderByKey => {
  const s = String(v ?? "").toLowerCase();
  if (s === "nombre") return "nombre";
  if (s === "id" || s === "ids" || s === "id_solicitante") return "id";
  return "empresa";
};
const parseOrderDir = (v: unknown): OrderDir => {
  const s = String(v ?? "").toLowerCase();
  return s === "desc" ? "desc" : "asc";
};

/** Por defecto: mostrar SOLO solicitantes con cuenta (google/microsoft) */
const parseOnlyWithAccount = (v: unknown) => {
  const s = String(v ?? "").trim().toLowerCase();
  // default = true (si no viene)
  if (s === "" || s === "1" || s === "true" || s === "yes") return true;
  if (s === "0" || s === "false" || s === "no") return false;
  return true;
};

/** ✅ Override: en clínicas (6/7) SIEMPRE mostrar "sin cuenta" cuando se filtra por esa empresa */
const applyClinicOverrideOnlyWithAccount = (empresaId: number, onlyWithAccount: boolean) => {
  if (empresaId > 0 && BOX_CLINIC_EMPRESA_IDS.has(empresaId)) return false;
  return onlyWithAccount;
};

/** Construye el orderBy compatible con Prisma para las 3 variantes */
const buildSolicitanteOrderBy = (
  orderByKey: OrderByKey,
  orderDir: OrderDir
): Prisma.SolicitanteOrderByWithRelationInput[] => {
  if (orderByKey === "nombre") {
    return [{ nombre: orderDir }, { id_solicitante: "asc" }];
  }
  if (orderByKey === "id") {
    return [{ id_solicitante: orderDir }];
  }
  // empresa
  const secondaryForNulls: Prisma.SortOrder = orderDir === "asc" ? "desc" : "asc";
  return [
    { empresa: { nombre: orderDir } },
    { empresaId: secondaryForNulls },
    { nombre: "asc" },
    { id_solicitante: "asc" },
  ];
};

/** Filtro base: “tiene cuenta” */
const buildWhereOnlyWithAccount = (): Prisma.SolicitanteWhereInput => ({
  OR: [
    { accountType: { in: ["google", "microsoft"] as any } },
    { googleUserId: { not: null } },
    { microsoftUserId: { not: null } },
  ],
});


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

    // default true
    const user = (req as any).user;

    // 👇 Si viene explícitamente en query → usarlo
    // 👇 Si NO viene → default depende del rol
    const onlyWithAccountRaw =
      req.query.onlyWithAccount !== undefined
        ? parseOnlyWithAccount(req.query.onlyWithAccount)
        : user?.rol === "CLIENTE"; // true para cliente, false para admin

    const onlyWithAccount = applyClinicOverrideOnlyWithAccount(
      empresaId,
      onlyWithAccountRaw
    );

    const includeMsDetails =
      String(req.query.includeMsDetails ?? "").toLowerCase() === "1" ||
      String(req.query.includeMsDetails ?? "").toLowerCase() === "true";

    const skip = (page - 1) * pageSize;

    const orderByKey = parseOrderBy(req.query.orderBy);
    const orderDir = parseOrderDir(req.query.orderDir);

    const INS: Prisma.QueryMode = "insensitive";

    const where: Prisma.SolicitanteWhereInput = {
      ...(user?.rol === "CLIENTE"
        ? { empresaId: Number(user.empresaId) }
        : empresaId > 0
          ? { empresaId }
          : {}),
      ...(q
        ? {
          OR: [
            { nombre: { contains: q, mode: INS } },
            { email: { contains: q, mode: INS } },
            { empresa: { nombre: { contains: q, mode: INS } } },
          ],
        }
        : {}),
      ...(onlyGMS ? { accountType: { in: ["google", "microsoft"] as any } } : {}),
      ...(onlyWithAccount ? buildWhereOnlyWithAccount() : {}),
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
    const empresaIdSet = new Set(
      baseSolicitantes.map((s) => s.empresaId).filter((x): x is number => typeof x === "number")
    );
    const solicitanteIdSet = new Set(baseSolicitantes.map((s) => s.id_solicitante));

    const [empresas, equipos, msLinks] = await Promise.all([
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
      prisma.solicitanteMsLicense.findMany({
        where: { solicitanteId: { in: Array.from(solicitanteIdSet) } },
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
      if (eq.idSolicitante == null) continue;
      const list = equiposBySolic.get(eq.idSolicitante) ?? [];
      list.push(eq);
      equiposBySolic.set(eq.idSolicitante, list);
    }

    type MsLic = { skuId: string; skuPartNumber: string; displayName?: string };
    const msBySolic = new Map<number, MsLic[]>();
    for (const l of msLinks) {
      const list = msBySolic.get(l.solicitanteId) ?? [];
      const lic: MsLic = {
        skuId: l.skuId,
        skuPartNumber: l.sku?.skuPartNumber ?? l.skuId,
        ...(l.sku?.displayName ? { displayName: l.sku.displayName } : {}),
      };
      list.push(lic);
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
      filters: {
        empresaId: user?.rol === "CLIENTE" ? Number(user.empresaId) : empresaId || null,
        q: q ?? null,
        onlyGMS,
        // ✅ devolvemos el valor final aplicado (con override)
        onlyWithAccount,
        includeMsDetails,
      },
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
    const q = (req.query.q as string | undefined)?.trim();

    const user = (req as any).user;

    const onlyWithAccountRaw =
      req.query.onlyWithAccount !== undefined
        ? parseOnlyWithAccount(req.query.onlyWithAccount)
        : user?.rol === "CLIENTE";

    const onlyWithAccount = applyClinicOverrideOnlyWithAccount(
      empresaId,
      onlyWithAccountRaw
    );

    if (user?.rol === "CLIENTE" && empresaId !== user.empresaId) {
      return res.status(403).json({ error: "No autorizado" });
    }

    if (empresaId <= 0) {
      return res.status(400).json({ error: "empresaId requerido y debe ser entero > 0" });
    }

    const orderByKey = parseOrderBy(req.query.orderBy);
    const orderDir = parseOrderDir(req.query.orderDir);

    const where: Prisma.SolicitanteWhereInput = {
      empresaId,
      ...(q ? { nombre: { contains: q, mode: "insensitive" } } : {}),
      ...(onlyWithAccount ? buildWhereOnlyWithAccount() : {}),
    };

    const rows = await prisma.solicitante.findMany({
      where,
      orderBy: buildSolicitanteOrderBy(orderByKey, orderDir),
      select: { id_solicitante: true, nombre: true },
    });

    return res.json({
      items: rows.map((s) => ({ id: s.id_solicitante, nombre: s.nombre })),
    });
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

    const user = (req as any).user;

    const onlyWithAccountRaw =
      req.query.onlyWithAccount !== undefined
        ? parseOnlyWithAccount(req.query.onlyWithAccount)
        : user?.rol === "CLIENTE";

    const onlyWithAccount = applyClinicOverrideOnlyWithAccount(
      empresaId,
      onlyWithAccountRaw
    );

    const userEmpresaId = user?.rol === "CLIENTE" && user?.empresaId ? Number(user.empresaId) : null;
    const includeEmpresa = String(req.query.includeEmpresa ?? "").toLowerCase() === "true";
    const q = (req.query.q as string | undefined)?.trim();

    const limit = clamp(toInt(req.query.limit, 100), 1, 500);

    const INS: Prisma.QueryMode = "insensitive";
    const effectiveEmpresaId = userEmpresaId ?? (empresaId > 0 ? empresaId : null);

    const where: Prisma.SolicitanteWhereInput = {
      ...(effectiveEmpresaId ? { empresaId: effectiveEmpresaId } : {}),
      ...(q
        ? {
          OR: [
            { nombre: { contains: q, mode: INS } },
            { email: { contains: q, mode: INS } },
            { empresa: { nombre: { contains: q, mode: INS } } },
          ],
        }
        : {}),
      ...(onlyWithAccount ? buildWhereOnlyWithAccount() : {}),
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
      return {
        value: r.id_solicitante,
        text,
        id: r.id_solicitante,
        nombre: r.nombre,
        empresaNombre,
      };
    });

    return res.json({ items });
  } catch (err: unknown) {
    console.error("[solicitantes.select] error:", err);
    return res.status(500).json({ error: "No se pudo obtener el listado para select" });
  }
};

/* ============================================================
 * GET /solicitantes/metrics
 * ============================================================ */
export const solicitantesMetrics = async (req: Request, res: Response) => {
  try {
    const q = (req.query.q as string | undefined)?.trim();
    const empresaId = toInt(req.query.empresaId);

    const user = (req as any).user;

    const onlyWithAccountRaw =
      req.query.onlyWithAccount !== undefined
        ? parseOnlyWithAccount(req.query.onlyWithAccount)
        : user?.rol === "CLIENTE";

    const onlyWithAccount = applyClinicOverrideOnlyWithAccount(
      empresaId,
      onlyWithAccountRaw
    );
    const userEmpresaId = user?.rol === "CLIENTE" && user?.empresaId ? Number(user.empresaId) : null;

    const INS: Prisma.QueryMode = "insensitive";
    const where: Prisma.SolicitanteWhereInput = {
      ...(userEmpresaId ? { empresaId: userEmpresaId } : empresaId > 0 ? { empresaId } : {}),
      ...(q
        ? {
          OR: [
            { nombre: { contains: q, mode: INS } },
            { email: { contains: q, mode: INS } },
            { empresa: { nombre: { contains: q, mode: INS } } },
          ],
        }
        : {}),
      ...(onlyWithAccount ? buildWhereOnlyWithAccount() : {}),
    };

    const solicitantes = await prisma.solicitante.count({ where });

    const distinctEmpresas = await prisma.solicitante.findMany({
      where,
      select: { empresaId: true },
      distinct: ["empresaId"],
    });
    const empresas = distinctEmpresas.filter((e) => typeof e.empresaId === "number").length;

    const ids = await prisma.solicitante.findMany({
      where,
      select: { id_solicitante: true },
    });
    const idList = ids.map((s) => s.id_solicitante);

    const equipos =
      idList.length === 0
        ? 0
        : await prisma.equipo.count({
          where: { idSolicitante: { in: idList } },
        });

    return res.json({
      solicitantes,
      empresas,
      equipos,
      filters: {
        empresaId: userEmpresaId ?? (empresaId > 0 ? empresaId : null),
        q: q ?? null,
        onlyWithAccount,
      },
    });
  } catch (err: unknown) {
    console.error("[solicitantes.metrics] error:", err);
    return res.status(500).json({ error: "No se pudieron calcular las métricas" });
  }
};

/* ===================== CREATE ===================== */
export const createSolicitante = async (req: Request, res: Response) => {
  try {
    const nombre = String(req.body?.nombre ?? "").trim();
    const emailRaw = (req.body?.email ?? null) as string | null;
    const email = emailRaw ? String(emailRaw).trim() : null;
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

/* ===================== READ (uno) ===================== */
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

    const user = (req as any).user;
    if (user?.rol === "CLIENTE" && solicitante.empresaId !== user.empresaId) {
      return res.status(403).json({ error: "No autorizado" });
    }

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
      req.body?.email === null
        ? null
        : typeof req.body?.email === "string"
          ? req.body.email.trim()
          : undefined;
    const empresaId =
      typeof req.body?.empresaId !== "undefined" ? toInt(req.body.empresaId) : undefined;

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
      if (transferToId <= 0) {
        return res.status(400).json({ error: "transferToId debe ser entero > 0" });
      }
      if (transferToId === id) {
        return res.status(400).json({ error: "transferToId no puede ser el mismo solicitante" });
      }
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

    await prisma.$transaction(
      async (tx) => {
        // ======================================
        // 1️⃣ TRANSFERENCIAS PRINCIPALES
        // ======================================
        if (transferToId) {
          await tx.equipo.updateMany({ where: { idSolicitante: id }, data: { idSolicitante: transferToId } });
          await tx.historial.updateMany({ where: { solicitanteId: id }, data: { solicitanteId: transferToId } });
          await tx.freshdeskRequesterMap.updateMany({ where: { solicitanteId: id }, data: { solicitanteId: transferToId } });
          await tx.freshdeskTicket.updateMany({ where: { solicitanteId: id }, data: { solicitanteId: transferToId } });
          await tx.visita.updateMany({ where: { solicitanteId: id }, data: { solicitanteId: transferToId } });
        } else {
          const saId = await ensureSaSolicitante(source.empresaId);

          await tx.equipo.updateMany({ where: { idSolicitante: id }, data: { idSolicitante: saId } });
          await tx.historial.updateMany({ where: { solicitanteId: id }, data: { solicitanteId: saId } });
          await tx.freshdeskRequesterMap.updateMany({ where: { solicitanteId: id }, data: { solicitanteId: saId } });

          await tx.freshdeskTicket.updateMany({
            where: { solicitanteId: id },
            data: { solicitanteId: fallback === "sa" ? saId : null },
          });

          await tx.visita.updateMany({
            where: { solicitanteId: id },
            data: { solicitanteId: fallback === "sa" ? saId : null },
          });
        }

        // ======================================
        // 2️⃣ LIMPIEZA DE RELACIONES DIRECTAS
        // ======================================
        await tx.solicitanteMsLicense.deleteMany({ where: { solicitanteId: id } });
        await tx.firma.deleteMany({ where: { solicitanteId: id } });
        await tx.servidorUsuario.deleteMany({ where: { solicitanteId: id } });

        await tx.ticket.updateMany({
          where: { requesterId: id },
          data: { requesterId: null },
        });

        // ======================================
        // 3️⃣ DELETE FINAL
        // ======================================
        await tx.solicitante.delete({ where: { id_solicitante: id } });
      },
      { timeout: 15000 }
    );

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