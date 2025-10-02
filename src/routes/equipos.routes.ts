// src/routes/equipos.routes.ts
import { Router } from "express";
import { listEquipos } from "../controllers/equipos.controller.js";

export const equiposRouter = Router();
equiposRouter.get("/", listEquipos);
