// src/routes.ts
import { Router } from "express";

/* ===================== Core de la app ===================== */
import { authRouter } from "./routes/auth.routes.js";
import { solicitantesRouter } from "./routes/solicitantes.routes.js";
import { visitasRouter } from "./routes/visitas.routes.js";
import { equiposRouter } from "./routes/equipos.routes.js";
import { clientesRouter } from "./routes/clientes.routes.js";
import reportesRouter from "./routes/reportes.routes.js";
import { detalleEmpresaRouter } from "./routes/detalle-empresa.routes.js";
import { empresasRouter } from "./routes/empresas.routes.js";

import fichaEmpresasRouter from "./routes/routes-empresas/ficha-empresas.routes.js";

import inventarioRoutes from "./routes/inventario.routes.js";

/* ===================== GESTIOO ===================== */
import entidadesRouter from "./routes/entidades.routes.js";
import productosGestiooRouter from "./routes/productos-gestioo.routes.js";
import serviciosGestiooRouter from "./routes/servicios-gestioo.routes.js";
import marcasGestiooRouter from "./routes/marcas-gestioo.routes.js";
import modelosGestiooRouter from "./routes/modelos-gestioo.routes.js";
import detalleTrabajoGestiooRouter from "./routes/detalle-trabajo-gestioo.routes.js";
import cotizacionesRouter from "./routes/cotizaciones.routes.js";

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

/* ===================== CLOUDINARY ===================== */
import uploadRoutes from "./routes/upload-imagenes.routes.js";

/* ========================================================= */
export const api = Router();

/* ===================== App Core ===================== */
api.use("/auth", authRouter);
api.use("/solicitantes", solicitantesRouter);
api.use("/visitas", visitasRouter);
api.use("/equipos", equiposRouter);
api.use("/clientes", clientesRouter);
api.use("/detalle-empresa", detalleEmpresaRouter);
api.use("/empresas", empresasRouter);
api.use("/ficha-empresa", fichaEmpresasRouter);

api.use("/tecnicos", tecnicosRouter);

api.use("/inventario", inventarioRoutes);

/* ===================== Freshdesk ===================== */
// Rutas generales de Freshdesk (/api/fd/*)
api.use("/fd", fdRouter);
// API de tickets (/api/tickets/*)
// Webhook de Freshdesk (p.ej. POST /api/fd/webhook)
api.use("/fd", fdWebhookRouter);
// API de tickets (/api/tickets/*)
api.use("/tickets", ticketsApiRouter);

/* ===================== GESTIOO ===================== */
api.use("/entidades", entidadesRouter);
api.use("/productos-gestioo", productosGestiooRouter);
api.use("/servicios-gestioo", serviciosGestiooRouter);
api.use("/marcas-gestioo", marcasGestiooRouter);
api.use("/modelos-gestioo", modelosGestiooRouter);
api.use("/detalle-trabajo-gestioo", detalleTrabajoGestiooRouter);
api.use("/cotizaciones", cotizacionesRouter);

/* ===================== Integraciones ===================== */
// Google Directory sync (ej: POST /api/sync/google/users)
api.use(syncGoogleRouter);


// Microsoft Graph sync 
api.use(msSyncRouter);

/* ===================== Reportes ===================== */
api.use("/reportes", reportesRouter);

/* ===================== Debug ===================== */
api.use("/debug", debugRouter);

/* ===================== Whatchimp ===================== */
api.use(whatchimpRouter);

/* ===================== CLOUDINARY ===================== */
api.use("/upload-imagenes", uploadRoutes);

/* ===================== Export ===================== */
export default api;
