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
import mantencionesRemotasRouter from "./routes/mantencionesRemotas.routes.js";

import fichaEmpresasRouter from "./routes/routes-empresas/ficha-empresas.routes.js";

// ✅ Maintenance / Jobs
import solicitantesMaintenanceRouter from "./routes/solicitantesMaintenance.routes.js";

// Reportes e Inventario export
import inventarioRoutes from "./routes/inventario.routes.js";
import reportesUploadRouter from "./routes/reportes-upload.routes.js";

/* ===================== GESTIOO ===================== */
import entidadesRouter from "./routes/entidades.routes.js";
import productosGestiooRouter from "./routes/productos-gestioo.routes.js";
import serviciosGestiooRouter from "./routes/servicios-gestioo.routes.js";
import marcasGestiooRouter from "./routes/marcas-gestioo.routes.js";
import modelosGestiooRouter from "./routes/modelos-gestioo.routes.js"; // <- si tu archivo real es modelos.routes.js, ajusta
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

/* ===================== HELP DESK RIDS ===================== */
import ticketeraRouter from "./routes/ticketera-routes/ticketera.routes.js";
import FirmasRouter from "./routes/ticketera-routes/firmas.routes.js";

/* ===================== HISTORIAL DE CAMBIOS ===================== */
import auditRouter from "./routes/historial-cambios-routes/audit.routes.js";

/* ===================== TEAMVIEWER ===================== */
import teamviewerRouter from "./routes/teamviewer-routes/teamviewer.routes.js";

/* ===================== IA INVENTARIO ===================== */
import iaInventarioRouter from "./routes/ia-intranet-routes/ia-inventario.routes.js";
import iaReportesRouter from "./routes/ia-intranet-routes/ia-reportes.routes.js";
import iaRecomendacionesRouter from "./routes/ia-intranet-routes/ia-recomendaciones.routes.js";

/* ===================== AGENDA AUTOMATIZADA ===================== */
import { agendaRouter } from "./routes/agenda.routes.js";

/* ===================== CORREO ===================== */
import correoRouter from "./routes/correo.routes.js";

/* ========================================================= */
import { auth } from "./middlewares/auth.js";

export const api = Router();

api.use(auth(false));

/* ===================== App Core ===================== */
api.use("/auth", authRouter);
api.use("/solicitantes", solicitantesRouter);
api.use("/agenda", agendaRouter);

// ✅ Maintenance de solicitantes
// Tu router define: POST /solicitantes/cleanup/no-cuenta
// Entonces se monta sin prefijo extra para que quede: POST /api/solicitantes/cleanup/no-cuenta
api.use(solicitantesMaintenanceRouter);

api.use("/visitas", visitasRouter);
api.use("/equipos", equiposRouter);
api.use("/clientes", clientesRouter);
api.use("/detalle-empresa", detalleEmpresaRouter);
api.use("/empresas", empresasRouter);
api.use("/ficha-empresa", fichaEmpresasRouter);
api.use("/mantenciones-remotas", mantencionesRemotasRouter);

api.use("/tecnicos", tecnicosRouter);

// Reportes e Inventario
api.use("/inventario", inventarioRoutes);
api.use("/reportes-upload", reportesUploadRouter);

/* ===================== Freshdesk ===================== */
// Rutas generales de Freshdesk (/api/fd/*)
api.use("/fd", fdRouter);
// Webhook de Freshdesk (p.ej. POST /api/fd/webhook)
api.use("/fd", fdWebhookRouter);
// API de tickets (/api/tickets/*)
api.use("/tickets", ticketsApiRouter);

/* ===================== HELP DESK RIDS ===================== */
api.use("/helpdesk/tickets", ticketeraRouter);
api.use("/helpdesk/firmas", FirmasRouter);

/* ===================== GESTIOO ===================== */
api.use("/entidades", entidadesRouter);
api.use("/productos-gestioo", productosGestiooRouter);
api.use("/servicios-gestioo", serviciosGestiooRouter);
api.use("/marcas-gestioo", marcasGestiooRouter);
api.use("/modelos", modelosGestiooRouter);
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

/* ===================== HISTORIAL DE CAMBIOS ===================== */
api.use("/audit", auditRouter);

/* ===================== TEAMVIEWER ===================== */
api.use("/teamviewer", teamviewerRouter);

/* ===================== IA INVENTARIO ===================== */
api.use("/ia-inventario", iaInventarioRouter);
api.use("/ia-reportes", iaReportesRouter);
api.use("/ia-recomendaciones", iaRecomendacionesRouter);

/* ===================== CORREO ===================== */
api.use("/correo", correoRouter);

/* ===================== Export ===================== */
export default api;