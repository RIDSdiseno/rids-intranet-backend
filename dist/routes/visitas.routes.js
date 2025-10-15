// src/routes/visitas.routes.ts
import { Router } from "express";
import { listVisitas, getVisitasMetrics, visitasMetrics, getVisitasFilters, createVisita, getVisitaById, updateVisita, deleteVisita, closeVisita, } from "../controllers/visitas.controller.js";
export const visitasRouter = Router();
// --- Primero endpoints fijos/“no id” ---
visitasRouter.get("/metrics", (req, res, next) => {
    Promise.resolve(visitasMetrics(req, res)).catch(next);
});
visitasRouter.get("/metrics/summary", (req, res, next) => {
    Promise.resolve(getVisitasMetrics(req, res)).catch(next);
});
visitasRouter.get("/filters", (req, res, next) => {
    Promise.resolve(getVisitasFilters(req, res)).catch(next);
});
// --- Listado y creación ---
visitasRouter.get("/", (req, res, next) => {
    Promise.resolve(listVisitas(req, res)).catch(next);
});
visitasRouter.post("/", (req, res, next) => {
    Promise.resolve(createVisita(req, res)).catch(next);
});
// --- Luego las rutas con :id (comodín) ---
visitasRouter.get("/:id", (req, res, next) => {
    Promise.resolve(getVisitaById(req, res)).catch(next);
});
visitasRouter.patch("/:id", (req, res, next) => {
    Promise.resolve(updateVisita(req, res)).catch(next);
});
visitasRouter.delete("/:id", (req, res, next) => {
    Promise.resolve(deleteVisita(req, res)).catch(next);
});
visitasRouter.post("/:id/close", (req, res, next) => {
    Promise.resolve(closeVisita(req, res)).catch(next);
});
//# sourceMappingURL=visitas.routes.js.map