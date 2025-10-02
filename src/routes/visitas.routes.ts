// src/routes/visitas.routes.ts
import { Router } from "express";
import {
  listVisitas,
  getVisitasMetrics,
  visitasMetrics,
  getVisitasFilters,
} from "../controllers/visitas.controller.js";

export const visitasRouter = Router();

// Listado con filtros y paginación
visitasRouter.get("/", (req, res, next) => {
  Promise.resolve(listVisitas(req, res)).catch(next);
});

// Métricas con desglose por empresa (para el gráfico)
visitasRouter.get("/metrics", (req, res, next) => {
  Promise.resolve(visitasMetrics(req, res)).catch(next);
});

// Métricas resumen (compatibilidad)
visitasRouter.get("/metrics/summary", (req, res, next) => {
  Promise.resolve(getVisitasMetrics(req, res)).catch(next);
});

// Catálogo de filtros (técnicos y empresas)
visitasRouter.get("/filters", (req, res, next) => {
  Promise.resolve(getVisitasFilters(req, res)).catch(next);
});
