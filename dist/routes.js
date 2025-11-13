// src/routes.ts
import { Router } from "express";
/* ===================== Core de la app ===================== */
/* ===================== Core de la app ===================== */
import { authRouter } from "./routes/auth.routes.js";
import { solicitantesRouter } from "./routes/solicitantes.routes.js";
import { visitasRouter } from "./routes/visitas.routes.js";
import { equiposRouter } from "./routes/equipos.routes.js";
import equiposProductosRouter from "./routes/equiposProductos.routes.js";
import { clientesRouter } from "./routes/clientes.routes.js";
import reportesRouter from "./routes/reportes.routes.js";
import { detalleEmpresaRouter } from "./routes/detalle-empresa.routes.js";
import { detalleTrabajoRouter } from "./routes/detalle-trabajo.routes.js";
import { empresasRouter } from "./routes/empresas.routes.js";
import tecnicosRouter from "./routes/tecnicos.routes.js";
/* ===================== Freshdesk ===================== */
import { fdRouter } from "./routes/fd.js";
import { fdWebhookRouter } from "./routes/fd.webhook.js";
import ticketsApiRouter from "./routes/tickets.routes.js";
/* ===================== Google Sync ===================== */
import syncGoogleRouter from "./routes/syncGoogle.routes.js";
/* ===================== Microsoft Sync ===================== */
import { msSyncRouter } from "./routes/msSync.js";
/* ===================== Debug ===================== */
import { debugRouter } from "./routes/debug.js";
/* ===================== Whatchimp ===================== */
import whatchimpRouter from "./routes/whatchimp.routes.js";
/* ========================================================= */
export const api = Router();
/* ===================== App Core ===================== */
api.use("/auth", authRouter);
api.use("/solicitantes", solicitantesRouter);
api.use("/visitas", visitasRouter);
api.use("/equipos", equiposRouter);
api.use("/equiposProductos", equiposProductosRouter);
api.use("/clientes", clientesRouter);
api.use("/detalle-empresa", detalleEmpresaRouter);
api.use("/detalle-trabajo", detalleTrabajoRouter);
api.use("/empresas", empresasRouter);
api.use("/tecnicos", tecnicosRouter);
/* ===================== Freshdesk ===================== */
// Rutas generales de Freshdesk (/api/fd/*)
api.use("/fd", fdRouter);
// Webhook de Freshdesk (p.ej. POST /api/fd/webhook)
api.use("/fd", fdWebhookRouter);
// API de tickets (/api/tickets/*)
// Webhook de Freshdesk (p.ej. POST /api/fd/webhook)
api.use("/fd", fdWebhookRouter);
// API de tickets (/api/tickets/*)
api.use("/tickets", ticketsApiRouter);
/* ===================== Integraciones ===================== */
// Google Directory sync (ej: POST /api/sync/google/users)
api.use(syncGoogleRouter);
// Microsoft Graph sync 
api.use(msSyncRouter);
/* ===================== Integraciones ===================== */
// Google Directory sync (ej: POST /api/sync/google/users)
api.use(syncGoogleRouter);
// Microsoft Graph sync 
api.use(msSyncRouter);
/* ===================== Reportes ===================== */
api.use("/reportes", reportesRouter);
/* ===================== Debug ===================== */
/* ===================== Debug ===================== */
api.use("/debug", debugRouter);
/* ===================== Whatchimp ===================== */
api.use(whatchimpRouter);
/* ===================== Export ===================== */
/* ===================== Whatchimp ===================== */
api.use(whatchimpRouter);
/* ===================== Export ===================== */
export default api;
//# sourceMappingURL=routes.js.map