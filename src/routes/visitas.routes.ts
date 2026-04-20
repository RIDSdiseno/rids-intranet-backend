import { Router } from "express";
import { auth } from "../middlewares/auth.js";
import { onlyRole } from "../middlewares/roles.js";
import { onlyOwnEmpresa } from "../middlewares/auth.js";

import {
  listVisitas,
  getVisitasMetrics,
  visitasMetrics,
  getVisitasFilters,
  createVisita,
  getVisitaById,
  updateVisita,
  deleteVisita,
  closeVisita,
  getVisitasDashboard,
} from "../controllers/visitas.controller.js";

export const visitasRouter = Router();

/* ========= Endpoints sin :id ========= */
visitasRouter.get("/metrics", (req, res, next) => {
  Promise.resolve(visitasMetrics(req, res)).catch(next);
});

visitasRouter.get("/metrics/summary", (req, res, next) => {
  Promise.resolve(getVisitasMetrics(req, res)).catch(next);
});

visitasRouter.get("/filters", (req, res, next) => {
  Promise.resolve(getVisitasFilters(req, res)).catch(next);
});

// ← NUEVO: debe ir antes de /:id
visitasRouter.get("/dashboard", auth(), onlyOwnEmpresa(), (req, res, next) => {
  Promise.resolve(getVisitasDashboard(req, res)).catch(next);
});

/* ========= Listado ========= */
visitasRouter.get("/", (req, res, next) => {
  Promise.resolve(listVisitas(req, res)).catch(next);
});

/* ========= Crear (solo admin) ========= */
visitasRouter.post("/", auth(), onlyRole("ADMIN"), (req, res, next) => {
  Promise.resolve(createVisita(req, res)).catch(next);
});

/* ========= Rutas con :id ========= */
visitasRouter.get("/:id", (req, res, next) => {
  Promise.resolve(getVisitaById(req, res)).catch(next);
});

visitasRouter.patch("/:id", auth(), onlyRole("ADMIN"), (req, res, next) => {
  Promise.resolve(updateVisita(req, res)).catch(next);
});

visitasRouter.delete("/:id", auth(), onlyRole("ADMIN"), (req, res, next) => {
  Promise.resolve(deleteVisita(req, res)).catch(next);
});

visitasRouter.post("/:id/close", auth(), (req, res, next) => {
  Promise.resolve(closeVisita(req, res)).catch(next);
});