// src/routes/agenda.routes.ts
import { Router } from "express";
import {
  generarMalla,
  getAgenda,
  getAgendaDesdeOutlookController,
  syncAgendaOutlook,
  cleanupAgendaOutlook,
  listarEmpresasAgenda,
  updateVisita,
  eliminarVisita,
  reprogramarTecnicos,
  eliminarMalla,
  crearVisitaManual,
  enviarNotaAgenda,
} from "../controllers/agenda.controller.js";

import type { Request, Response, NextFunction } from "express";

const TECNICOS_AGENDA_ADMIN = [5, 6, 27];

function requireAgendaAdmin(req: Request, res: Response, next: NextFunction) {
    const user = (req as any).user;
    if (!user || !TECNICOS_AGENDA_ADMIN.includes(user.id)) {
        return res.status(403).json({ error: "No tienes permisos para esta acción" });
    }
    next();
    return;
}

export const agendaRouter = Router();

// --- Acciones especiales (antes de los comodines :id) ---
agendaRouter.post("/generar", requireAgendaAdmin, (req, res, next) => {
  Promise.resolve(generarMalla(req, res)).catch(next);
});
agendaRouter.post("/outlook/sync", (req, res, next) => {
  Promise.resolve(syncAgendaOutlook(req, res)).catch(next);
});
agendaRouter.post("/outlook/cleanup", (req, res, next) => {
  Promise.resolve(cleanupAgendaOutlook(req, res)).catch(next);
});

// --- Listado ---
agendaRouter.get("/", (req, res, next) => {
  Promise.resolve(getAgenda(req, res)).catch(next);
});
agendaRouter.get("/outlook/:year/:month", (req, res, next) => {
  Promise.resolve(getAgendaDesdeOutlookController(req, res)).catch(next);
});
agendaRouter.get("/empresas", (req, res, next) => {
  Promise.resolve(listarEmpresasAgenda(req, res)).catch(next);
});

// --- Acciones sobre la malla completa y creación manual ---
agendaRouter.delete("/malla", requireAgendaAdmin, (req, res, next) => {
  Promise.resolve(eliminarMalla(req, res)).catch(next);
});
agendaRouter.post("/manual", requireAgendaAdmin, (req, res, next) => {
  Promise.resolve(crearVisitaManual(req, res)).catch(next);
});
agendaRouter.post("/:id/enviar-nota", (req, res, next) => {
  Promise.resolve(enviarNotaAgenda(req, res)).catch(next);
});

// --- Rutas con :id ---
agendaRouter.patch("/:id", requireAgendaAdmin, (req, res, next) => {
  Promise.resolve(updateVisita(req, res)).catch(next);
});
agendaRouter.delete("/:id", requireAgendaAdmin, (req, res, next) => {
  Promise.resolve(eliminarVisita(req, res)).catch(next);
});
agendaRouter.put("/:id/tecnicos", requireAgendaAdmin, (req, res, next) => {
  Promise.resolve(reprogramarTecnicos(req, res)).catch(next);
});
