// src/routes/msSync.ts
import { Router } from "express";
import pLimit from "p-limit";
import { listUsersWithLicenses } from "../ms/graph.js";
import { upsertSolicitanteFromMicrosoft } from "../service/solicitanteSyncMs.js";
import type { MsUserInput } from "../service/solicitanteSyncMs.js";
import { prisma } from "../lib/prisma.js";

export const msSyncRouter = Router();

/* =================== Tipos locales =================== */
// Lo que devuelve tu capa de Graph
type MsUser = {
  id?: string | null;
  email?: string | null;
  name?: string | null; // string en tu implementación actual
  suspended?: boolean | null;
  licenses?: Array<{ skuId: string; skuPartNumber: string; displayName?: string }>;
};

/* =================== Utils =================== */

/** MsUser[] -> MsUserInput[] (name:string y licenses sin displayName:undefined) */
function normalizeForUpsert(target: MsUser[]): MsUserInput[] {
  return target.map((u): MsUserInput => {
    const nameStr = (u.name ?? "").trim() || "Usuario";
    const emailStr = u.email ?? null;
    const suspended = !!u.suspended;

    const licenses =
      (u.licenses ?? []).map(l => ({
        skuId: l.skuId,
        skuPartNumber: l.skuPartNumber,
        // Evitamos poner displayName cuando venga undefined (por exactOptionalPropertyTypes)
        ...(l.displayName !== undefined ? { displayName: l.displayName } : {}),
      })) as MsUserInput["licenses"];

    return {
      id: (u.id ?? "").trim(),
      email: emailStr,
      name: nameStr, // string, como exige el servicio
      suspended,
      licenses,
    };
  });
}

/** Pre-crea catálogo de SKUs en un solo batch para evitar N upserts por usuario */
async function precreateSkus(msUsers: MsUserInput[]) {
  const uniq = new Map<string, { skuId: string; skuPartNumber: string; displayName?: string }>();
  for (const u of msUsers) {
    for (const l of (u.licenses ?? [])) {
      if (!uniq.has(l.skuId)) uniq.set(l.skuId, l);
    }
  }
  const data = [...uniq.values()].map(x => ({
    skuId: x.skuId,
    skuPartNumber: x.skuPartNumber,
    displayName: x.displayName ?? x.skuPartNumber,
  }));
  if (data.length === 0) return { createdOrSkipped: 0 };
  await prisma.msSku.createMany({ data, skipDuplicates: true });
  return { createdOrSkipped: data.length };
}

/** Divide un array en chunks */
function chunk<T>(arr: T[], size: number): T[][] {
  if (size <= 0) return [arr];
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

/** Upsert paralelo (limitado) y métricas, con chunking opcional para grandes volúmenes */
async function syncMsUsersBatch(
  msUsers: MsUserInput[],
  empresaId: number,
  opts?: { concurrency?: number; chunkSize?: number }
) {
  let created = 0, updated = 0, skipped = 0;

  // 1) Catálogo de SKUs (una sola vez por lote)
  const tSku0 = Date.now();
  const skuInfo = await precreateSkus(msUsers);
  const skuMs = Date.now() - tSku0;

  // 2) Upsert paralelo con límite (y chunking opcional)
  const concurrency = Math.max(1, opts?.concurrency ?? 8);
  const limit = pLimit(concurrency);
  const chunks = opts?.chunkSize ? chunk(msUsers, opts.chunkSize) : [msUsers];

  const tDb0 = Date.now();
  for (let i = 0; i < chunks.length; i++) {
    const part: MsUserInput[] | undefined = chunks[i];
    if (!part || part.length === 0) continue; // <- fix: guard clause

    await Promise.all(
      part.map(u =>
        limit(async () => {
          if (!u.id || !u.email) { skipped++; return; }

          // Solo para métrica created/updated; si no te interesa, elimínalo para ahorrar una consulta
          const existed = await prisma.solicitante.findUnique({
            where: { microsoftUserId: u.id },
            select: { id_solicitante: true },
          }).catch(() => null);

          const result = await upsertSolicitanteFromMicrosoft(u, empresaId);
          if (result === null) { skipped++; return; }

          if (existed) updated++; else created++;
        })
      )
    );
  }
  const dbMs = Date.now() - tDb0;

  return {
    total: msUsers.length,
    created,
    updated,
    skipped,
    sample: msUsers.slice(0, 5),
    timings: { skuMs, dbMs, skuCountProcessed: skuInfo.createdOrSkipped, concurrency, chunks: chunks.length }
  };
}

/** Reutilizable por GET/POST/PUT según filtros opcionales. */
async function selectMsUsers(domain?: string, email?: string) {
  const t0 = Date.now();
  const all: MsUser[] = await listUsersWithLicenses(domain ? { filterDomain: domain } : undefined);
  const graphMs = Date.now() - t0;

  const target = email
    ? all.filter(u => (u.email || "").toLowerCase() === email.trim().toLowerCase())
    : all;

  return { target, allCount: all.length, timings: { graphMs } };
}

/* =================== Debug =================== */

/**
 * GET /api/ms/debug/users?domain=colchagua.cl&limit=10
 */
msSyncRouter.get("/ms/debug/users", async (req, res) => {
  try {
    const domain = (req.query.domain as string | undefined)?.trim() || undefined;
    const limit = Number(req.query.limit ?? 0);

    const sel = await selectMsUsers(domain, undefined);

    res.json({
      ok: true,
      timings: sel.timings,
      total: sel.allCount,
      sample: limit > 0 ? sel.target.slice(0, limit) : sel.target.slice(0, 5),
      users: limit > 0 ? sel.target.slice(0, limit) : undefined,
    });
  } catch (e: any) {
    console.error("[GET /ms/debug/users] ERROR:", e?.response?.data || e);
    res.status(500).json({ ok: false, error: e?.message || "internal" });
  }
});

/**
 * GET /api/ms/debug/domains
 */
msSyncRouter.get("/ms/debug/domains", async (_req, res) => {
  try {
    const users: MsUser[] = await listUsersWithLicenses();
    const domains: Record<string, number> = {};

    for (const u of users) {
      const em = (u.email || "").toLowerCase();
      const dom = em.includes("@") ? em.split("@").pop()! : "(sin-dominio)";
      domains[dom] = (domains[dom] || 0) + 1;
    }

    res.json({ ok: true, total: users.length, domains, sample: users.slice(0, 5) });
  } catch (e: any) {
    console.error("[GET /ms/debug/domains] ERROR:", e?.response?.data || e);
    res.status(500).json({ ok: false, error: e?.message || "internal" });
  }
});

/* =========== Rutas de sync =========== */

/**
 * POST /api/sync/microsoft/users
 * body: { empresaId: number, domain?: string, concurrency?: number, chunkSize?: number }
 * Re-sincroniza TODO el dominio (o tenant).
 */
msSyncRouter.post("/sync/microsoft/users", async (req, res) => {
  try {
    const { empresaId, domain, concurrency, chunkSize } = req.body as {
      empresaId?: number; domain?: string; concurrency?: number; chunkSize?: number;
    };
    if (!empresaId || isNaN(Number(empresaId))) {
      return res.status(400).json({ ok: false, error: "empresaId requerido (number)" });
    }

    const sel = await selectMsUsers(domain?.trim() || undefined, undefined);
    const normalized = normalizeForUpsert(sel.target);

    // ✅ construir opciones omitiendo claves undefined (exactOptionalPropertyTypes friendly)
    const opts: { concurrency?: number; chunkSize?: number } = {
      ...(typeof concurrency === "number" ? { concurrency } : {}),
      ...(typeof chunkSize === "number" ? { chunkSize } : {}),
    };

    const r = await syncMsUsersBatch(normalized, Number(empresaId), opts);
    res.json({ ok: true, ...r, timings: { ...sel.timings, ...r.timings } });
  } catch (e: any) {
    console.error("[POST /sync/microsoft/users] ERROR:", e?.response?.data || e);
    res.status(500).json({ ok: false, error: e?.message || "internal" });
  }
});

/**
 * GET /api/sync/microsoft/users?empresaId=123&domain=colchagua.cl
 * (atajo para Postman; mismo efecto que POST)
 */
msSyncRouter.get("/sync/microsoft/users", async (req, res) => {
  try {
    const empresaId = Number(req.query.empresaId);
    const domain = (req.query.domain as string | undefined)?.trim() || undefined;

    if (!empresaId || isNaN(empresaId)) {
      return res.status(400).json({ ok: false, error: "empresaId requerido (number)" });
    }

    const sel = await selectMsUsers(domain, undefined);
    const normalized = normalizeForUpsert(sel.target);
    const r = await syncMsUsersBatch(normalized, empresaId);
    res.json({ ok: true, ...r, timings: { ...sel.timings, ...r.timings } });
  } catch (e: any) {
    console.error("[GET /sync/microsoft/users] ERROR:", e?.response?.data || e);
    res.status(500).json({ ok: false, error: e?.message || "internal" });
  }
});

/**
 * PUT /api/sync/microsoft/users
 * body: { empresaId: number, domain?: string, email?: string, concurrency?: number }
 * - Sin `email`: re-sincroniza todo.
 * - Con `email`: re-sincroniza solo ese usuario.
 */
msSyncRouter.put("/sync/microsoft/users", async (req, res) => {
  try {
    const { empresaId, domain, email, concurrency } = req.body as {
      empresaId?: number; domain?: string; email?: string; concurrency?: number;
    };

    if (!empresaId || isNaN(Number(empresaId))) {
      return res.status(400).json({ ok: false, error: "empresaId requerido (number)" });
    }

    const sel = await selectMsUsers(
      domain?.trim() || undefined,
      email?.trim().toLowerCase()
    );

    if (email && sel.target.length === 0) {
      return res.status(404).json({
        ok: false,
        error: `No se encontró ${email} en Microsoft${domain ? ` (${domain})` : ""}`,
      });
    }

    const normalized = normalizeForUpsert(sel.target);

    // ✅ construir opciones omitiendo claves undefined
    const opts: { concurrency?: number } = {
      ...(typeof concurrency === "number" ? { concurrency } : {}),
    };

    const r = await syncMsUsersBatch(normalized, Number(empresaId), opts);

    res.json({
      ok: true,
      domain: domain ?? null,
      empresaId: Number(empresaId),
      filter: email ?? null,
      ...r,
      timings: { ...sel.timings, ...r.timings }
    });
  } catch (e: any) {
    console.error("[PUT /sync/microsoft/users] ERROR:", e?.response?.data || e);
    res.status(500).json({ ok: false, error: e?.message || "internal" });
  }
});

export default msSyncRouter;
