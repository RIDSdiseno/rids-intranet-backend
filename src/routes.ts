// src/routes.ts
import { Router /*, type Express */ } from "express";

// === Rutas existentes de tu app ===
import { authRouter } from "./routes/auth.routes.js";
import { solicitantesRouter } from "./routes/solicitantes.routes.js";
import { visitasRouter } from "./routes/visitas.routes.js";
import { equiposRouter } from "./routes/equipos.routes.js";
import equiposProductosRouter from "./routes/equiposProductos.routes.js";
import { clientesRouter } from "./routes/clientes.routes.js";

import { detalleEmpresaRouter } from "./routes/detalle-empresa.routes.js";
import { detalleTrabajoRouter } from "./routes/detalle-trabajo.routes.js";


<<<<<<< HEAD
// === Freshdesk ===
=======
// Freshdesk
>>>>>>> 89e99b1246fee1ecf21735e9bd147b751ba2c68e
import { fdRouter } from "./routes/fd.js";
import { fdWebhookRouter } from "./routes/fd.webhook.js";
import ticketsApiRouter from "./routes/tickets.routes.js";

<<<<<<< HEAD
// === Reportes ===
import reportesRouter from "./routes/reportes.routes.js"; // GET /api/reportes/empresa/:empresaId?month=YYYY-MM

=======
>>>>>>> 89e99b1246fee1ecf21735e9bd147b751ba2c68e
export const api = Router();

/* ===================== App Core ===================== */
api.use("/auth", authRouter);
api.use("/solicitantes", solicitantesRouter);
api.use("/visitas", visitasRouter);
api.use("/equipos", equiposRouter);

<<<<<<< HEAD
/* ===================== Freshdesk ===================== */
api.use("/fd", fdRouter);            // GET/aux de FD
=======
api.use("/equiposProductos", equiposProductosRouter);
api.use("/clientes", clientesRouter);
api.use("/detalle-empresa", detalleEmpresaRouter);
api.use("/detalle-trabajo", detalleTrabajoRouter);

// === Freshdesk ===
api.use("/fd", fdRouter);
>>>>>>> 89e99b1246fee1ecf21735e9bd147b751ba2c68e
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
