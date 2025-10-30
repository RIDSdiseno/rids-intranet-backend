// src/routes/cron.routes.ts
import { Router } from "express";
import { syncGoogleUsersStatus, runOnce as runSyncNow } from "../jobs/cronSync.js";

const router = Router();

router.get("/admin/cron/sync-google-users/status", (_req, res) => {
  res.json({ ok: true, status: syncGoogleUsersStatus });
});

router.post("/admin/cron/sync-google-users/run", (_req, res) => {
  runSyncNow();
  res.json({ ok: true, message: "triggered" });
});

export default router;
