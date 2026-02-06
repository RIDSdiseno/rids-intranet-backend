// src/routes/msSync.ts
import { Router, type Request, type Response, type NextFunction } from "express";
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
  name?: string | null;
  suspended?: boolean | null;
  licenses?: Array<{ skuId: string; skuPartNumber: string; displayName?: string }>;
};

/* =================== Utils =================== */

/** MsUser[] -> MsUserInput[] */
function normalizeForUpsert(target: MsUser[]): MsUserInput[] {
  return target.map((u): MsUserInput => {
    const nameStr = (u.name ?? "").trim() || "Usuario";
    const emailStr = u.email ?? null;
    const suspended = !!u.suspended;

    const licenses =
      (u.licenses ?? []).map(l => ({
        skuId: l.skuId,
        skuPartNumber: l.skuPartNumber,
        ...(l.displayName !== undefined ? { displayName: l.displayName } : {}),
      })) as MsUserInput["licenses"];

    return {
      id: (u.id ?? "").trim(),
      email: emailStr,
      name: nameStr,
      suspended,
      licenses,
    };
  });
}

/** Pre-crea catálogo de SKUs */
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

/** Upsert paralelo (limitado) */
async function syncMsUsersBatch(
  msUsers: MsUserInput[],
  empresaId: number,
  opts?: { concurrency?: number; chunkSize?: number }
) {
  let created = 0, updated = 0, skipped = 0;

  // 1) Catálogo de SKUs
  const tSku0 = Date.now();
  const skuInfo = await precreateSkus(msUsers);
  const skuMs = Date.now() - tSku0;

  // 2) Upsert paralelo
  const concurrency = Math.max(1, opts?.concurrency ?? 8);
  const limit = pLimit(concurrency);
  const chunks = opts?.chunkSize ? chunk(msUsers, opts.chunkSize) : [msUsers];

  const tDb0 = Date.now();
  for (const part of chunks) {
    if (!part || part.length === 0) continue;

    await Promise.all(
      part.map(u =>
        limit(async () => {
          if (!u.id) { skipped++; return; }
          const { created: wasCreated } =
            await upsertSolicitanteFromMicrosoft(u, empresaId);
          if (wasCreated) created++; else updated++;
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
    timings: {
      skuMs,
      dbMs,
      skuCountProcessed: skuInfo.createdOrSkipped,
      concurrency,
      chunks: chunks.length,
    },
  };
}

/** Selector centralizado (Graph) */
async function selectMsUsers(domain: string, email?: string) {
  const t0 = Date.now();
  const all: MsUser[] = await listUsersWithLicenses({ filterDomain: domain });
  const graphMs = Date.now() - t0;

  const target = email
    ? all.filter(u => (u.email || "").toLowerCase() === email.trim().toLowerCase())
    : all;

  return { target, allCount: all.length, timings: { graphMs } };
}

/* =================== Debug =================== */

msSyncRouter.get(
  "/ms/debug/users",
  async (req: Request, res: Response): Promise<void> => {
    try {
      const domainRaw = (req.query.domain as string | undefined)?.trim();
      if (!domainRaw) {
        res.status(400).json({ ok: false, error: "domain es obligatorio" });
        return;
      }
      const domain = domainRaw.toLowerCase();
      const limit = Number(req.query.limit ?? 0);

      const sel = await selectMsUsers(domain, undefined);

      res.json({
        ok: true,
        timings: sel.timings,
        total: sel.allCount,
        sample: limit > 0 ? sel.target.slice(0, limit) : sel.target.slice(0, 5),
      });
    } catch (e: any) {
      console.error("[GET /ms/debug/users] ERROR:", e);
      res.status(500).json({ ok: false, error: e?.message || "internal" });
    }
  }
);

/* =================== Rutas de sync =================== */

/**
 * POST /api/sync/microsoft/users
 * body: { empresaId, domain, concurrency?, chunkSize? }
 */
msSyncRouter.post(
  "/sync/microsoft/users",
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { empresaId, domain, concurrency, chunkSize } = req.body as {
        empresaId?: number;
        domain?: string;
        concurrency?: number;
        chunkSize?: number;
      };

      if (!empresaId || isNaN(Number(empresaId))) {
        res.status(400).json({ ok: false, error: "empresaId requerido (number)" });
        return;
      }
      if (!domain || !domain.trim()) {
        res.status(400).json({
          ok: false,
          error: "domain es obligatorio para sincronizar una empresa",
        });
        return;
      }

      const cleanDomain = domain.trim().toLowerCase();

      const sel = await selectMsUsers(cleanDomain, undefined);
      const normalized = normalizeForUpsert(sel.target);

      const r = await syncMsUsersBatch(
        normalized,
        Number(empresaId),
        {
          ...(typeof concurrency === "number" ? { concurrency } : {}),
          ...(typeof chunkSize === "number" ? { chunkSize } : {}),
        }
      );

      res.json({ ok: true, domain: cleanDomain, empresaId, ...r, timings: { ...sel.timings, ...r.timings } });
    } catch (e: any) {
      console.error("[POST /sync/microsoft/users] ERROR:", e);
      res.status(500).json({ ok: false, error: e?.message || "internal" });
    }
  }
);

/**
 * GET /api/sync/microsoft/users?empresaId=123&domain=example.cl
 */
msSyncRouter.get(
  "/sync/microsoft/users",
  async (req: Request, res: Response): Promise<void> => {
    try {
      const empresaId = Number(req.query.empresaId);
      const domainRaw = (req.query.domain as string | undefined)?.trim();

      if (!empresaId || isNaN(empresaId)) {
        res.status(400).json({ ok: false, error: "empresaId requerido (number)" });
        return;
      }
      if (!domainRaw) {
        res.status(400).json({ ok: false, error: "domain es obligatorio" });
        return;
      }

      const domain = domainRaw.toLowerCase();

      const sel = await selectMsUsers(domain, undefined);
      const normalized = normalizeForUpsert(sel.target);
      const r = await syncMsUsersBatch(normalized, empresaId);

      res.json({ ok: true, domain, empresaId, ...r, timings: { ...sel.timings, ...r.timings } });
    } catch (e: any) {
      console.error("[GET /sync/microsoft/users] ERROR:", e);
      res.status(500).json({ ok: false, error: e?.message || "internal" });
    }
  }
);

/**
 * PUT /api/sync/microsoft/users
 * body: { empresaId, domain, email, concurrency? }
 */
msSyncRouter.put(
  "/sync/microsoft/users",
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { empresaId, domain, email, concurrency } = req.body as {
        empresaId?: number;
        domain?: string;
        email?: string;
        concurrency?: number;
      };

      if (!empresaId || isNaN(Number(empresaId))) {
        res.status(400).json({ ok: false, error: "empresaId requerido (number)" });
        return;
      }
      if (!domain || !domain.trim()) {
        res.status(400).json({
          ok: false,
          error: "domain es obligatorio incluso para sync por email",
        });
        return;
      }

      const cleanDomain = domain.trim().toLowerCase();
      const cleanEmail = email?.trim().toLowerCase();

      const sel = await selectMsUsers(cleanDomain, cleanEmail);

      if (cleanEmail && sel.target.length === 0) {
        res.status(404).json({
          ok: false,
          error: `No se encontró ${cleanEmail} en Microsoft (${cleanDomain})`,
        });
        return;
      }

      const normalized = normalizeForUpsert(sel.target);

      const r = await syncMsUsersBatch(
        normalized,
        Number(empresaId),
        { ...(typeof concurrency === "number" ? { concurrency } : {}) }
      );

      res.json({
        ok: true,
        domain: cleanDomain,
        empresaId,
        filter: cleanEmail ?? null,
        ...r,
        timings: { ...sel.timings, ...r.timings },
      });
    } catch (e: any) {
      console.error("[PUT /sync/microsoft/users] ERROR:", e);
      res.status(500).json({ ok: false, error: e?.message || "internal" });
    }
  }
);

export default msSyncRouter;
