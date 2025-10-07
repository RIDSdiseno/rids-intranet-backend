import { Router } from "express";
import { syncClosedTickets } from "../fd/syncClosed.js";

export const fdRouter = Router();

/**
 * GET /api/fd/sync-closed?since=2025-10-01T00:00:00Z
 * Si no envías since, usa 7 días atrás.
 */
fdRouter.get("/sync-closed", async (req, res) => {
  const since =
    (req.query.since as string) ||
    new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

  try {
    const imported = await syncClosedTickets(since);
    res.json({ ok: true, imported, since });
  } catch (e: any) {
    res.status(500).json({ ok: false, error: e?.message ?? "error" });
  }
});
