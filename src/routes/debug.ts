// src/routes/debug.ts
import { Router } from "express";
export const debugRouter = Router();

debugRouter.get("/secret", (_req, res) => {
  const sec = process.env.FD_WEBHOOK_SECRET ?? "";
  res.json({ present: !!sec, length: sec.length });
});
