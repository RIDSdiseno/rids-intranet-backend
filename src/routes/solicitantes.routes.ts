// src/routes/solicitantes.routes.ts
import { Router } from "express";
import { listSolicitantes } from "../controllers/solicitante.controller.js";
import auth from "../middlewares/auth.js";

export const solicitantesRouter = Router();
solicitantesRouter.get("/", auth, listSolicitantes);
