import { Router } from "express";
import { listAllUsers } from "../google/googleDirectory.js";
import { upsertSolicitanteFromGoogle } from "../service/solicitanteSync.js";
import { prisma } from "../lib/prisma.js";

const router = Router();

/**
 * POST /sync/google/users
 * body: { domain: string, empresaId: number }
 * Nota: si varias empresas comparten el dominio, llama este endpoint por empresa
 * pasando el empresaId que corresponda a ese lote.
 */
router.post("/sync/google/users", async (req, res) => {
  try {
    const { domain, empresaId } = req.body as { domain: string; empresaId: number };
    if (!domain || !empresaId)
      return res.status(400).json({ error: "domain y empresaId requeridos" });

    // ✅ Usa listAllUsers(domain) — el domain ahora determina el admin correcto
    const users = await listAllUsers(domain);

    let created = 0, updated = 0, skipped = 0;

    for (const u of users) {
      if (!u.id || !u.primaryEmail) {
        skipped++;
        continue;
      }

      const before = await prisma.solicitante.findUnique({
        where: { googleUserId: u.id } as any,
      });

      await upsertSolicitanteFromGoogle(
        {
          id: u.id,
          primaryEmail: u.primaryEmail,
          name: u.name,
          suspended: u.suspended,
        },
        empresaId
      );

      if (before) updated++;
      else created++;
    }

    res.json({
      ok: true,
      domain,
      empresaId,
      total: users.length,
      created,
      updated,
      skipped,
    });
  } catch (e: any) {
    console.error("[POST /sync/google/users] ERROR:", e);
    res.status(500).json({ ok: false, error: e?.message || "internal" });
  }
});

/**
 * PUT /sync/google/users
 * body: { domain: string, empresaId: number, email?: string }
 * - Sin `email`: re-sincroniza todo el dominio (idempotente).
 * - Con `email`: re-sincroniza solo ese usuario (si existe en Google).
 */
router.put("/sync/google/users", async (req, res) => {
  try {
    const { domain, empresaId, email } = req.body as {
      domain?: string;
      empresaId?: number;
      email?: string;
    };

    if (!domain || !empresaId)
      return res.status(400).json({ ok: false, error: "domain y empresaId requeridos" });

    // ✅ listAllUsers ahora selecciona el admin según el dominio
    const users = await listAllUsers(domain);

    const target = email
      ? users.filter(
          (u) =>
            (u.primaryEmail || "").toLowerCase() ===
            email.trim().toLowerCase()
        )
      : users;

    if (email && target.length === 0)
      return res
        .status(404)
        .json({ ok: false, error: `No se encontró ${email} en Google (${domain})` });

    let created = 0, updated = 0, skipped = 0;

    for (const u of target) {
      if (!u.id || !u.primaryEmail) {
        skipped++;
        continue;
      }

      const before = await prisma.solicitante.findUnique({
        where: { googleUserId: u.id } as any,
      });

      await upsertSolicitanteFromGoogle(
        {
          id: u.id,
          primaryEmail: u.primaryEmail,
          name: u.name,
          suspended: u.suspended,
        },
        Number(empresaId)
      );

      if (before) updated++;
      else created++;
    }

    res.json({
      ok: true,
      domain,
      empresaId,
      filter: email ?? null,
      total: target.length,
      created,
      updated,
      skipped,
    });
  } catch (e: any) {
    console.error("[PUT /sync/google/users] ERROR:", e);
    res.status(500).json({ ok: false, error: e?.message || "internal" });
  }
});

export default router;
