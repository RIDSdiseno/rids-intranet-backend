// src/api.ts
import { Router } from "express";
import { authRouter } from "./routes/auth.routes.js";
import { solicitantesRouter } from "./routes/solicitantes.routes.js";
import { visitasRouter } from "./routes/visitas.routes.js";
import {equiposRouter} from "./routes/equipos.routes.js"; // 👈 default

export const api = Router();

api.use("/auth", authRouter);
api.use("/solicitantes", solicitantesRouter);
api.use("/visitas", visitasRouter);
api.use("/equipos", equiposRouter);

export default api;
