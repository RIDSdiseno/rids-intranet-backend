// src/routes.ts
import { Router /*, type Express */ } from "express";

// === Rutas existentes de tu app ===
import { authRouter } from "./routes/auth.routes.js";
import { solicitantesRouter } from "./routes/solicitantes.routes.js";
import { visitasRouter } from "./routes/visitas.routes.js";
import { equiposRouter } from "./routes/equipos.routes.js";

// === Freshdesk ===
import { fdRouter } from "./routes/fd.js";
import { fdWebhookRouter } from "./routes/fd.webhook.js";
import ticketsApiRouter from "./routes/tickets.routes.js";

// === Reportes ===
import reportesRouter from "./routes/reportes.routes.js"; // GET /api/reportes/empresa/:empresaId?month=YYYY-MM

export const api = Router();

/* ===================== App Core ===================== */
api.use("/auth", authRouter);
api.use("/solicitantes", solicitantesRouter);
api.use("/visitas", visitasRouter);
api.use("/equipos", equiposRouter);

/* ===================== Freshdesk ===================== */
api.use("/fd", fdRouter);            // GET/aux de FD
api.use("/tickets", ticketsApiRouter);
api.use("/fd", fdWebhookRouter);     // POST /api/fd/webhook

/* ===================== Reportes ===================== */
api.use("/reportes", reportesRouter);

/* ===================== Export ===================== */
   // <-- NUEVO (POST /api/export/visitas-xlsx)

/* ===================== Debug opcional ===================== */
import { debugRouter } from "./routes/debug.js";
api.use("/debug", debugRouter);

// Si prefieres montar desde aquí:
// export default function routes(app: Express) { app.use("/api", api); }
export default api;
