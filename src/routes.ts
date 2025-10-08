// src/routes.ts
import { Router, type Express } from "express";

// Rutas existentes
import { authRouter } from "./routes/auth.routes.js";
import { solicitantesRouter } from "./routes/solicitantes.routes.js";
import { visitasRouter } from "./routes/visitas.routes.js";
import { equiposRouter } from "./routes/equipos.routes.js";
import equiposProductosRouter from "./routes/equiposProductos.routes.js";
import { clientesRouter } from "./routes/clientes.routes.js";

import { detalleEmpresaRouter } from "./routes/detalle-empresa.routes.js";
import { detalleTrabajoRouter } from "./routes/detalle-trabajo.routes.js";


// Freshdesk
import { fdRouter } from "./routes/fd.js";
import { fdWebhookRouter } from "./routes/fd.webhook.js";
import { debugRouter } from "./routes/debug.js";
import ticketsApiRouter from "./routes/tickets.routes.js";

export const api = Router();

// === Rutas de tu app ===
api.use("/auth", authRouter);
api.use("/solicitantes", solicitantesRouter);
api.use("/visitas", visitasRouter);
api.use("/equipos", equiposRouter);
api.use("/equiposProductos", equiposProductosRouter);
api.use("/clientes", clientesRouter);
api.use("/detalle-empresa", detalleEmpresaRouter);
api.use("/detalle-trabajo", detalleTrabajoRouter);

// === Freshdesk ===
api.use("/fd", fdRouter);
api.use("/tickets", ticketsApiRouter);

api.use("/fd", fdWebhookRouter); // POST /api/fd/webhook
// === Debug opcional ===
// src/routes.ts

api.use("/debug", debugRouter);


// Si prefieres montar desde aquí:
// export default function routes(app: Express) { app.use("/api", api); }
export default api;

