// src/routes/agenda.routes.ts
import { Router } from "express";
import { requireAuth } from "../middlewares/auth.js";
import { onlyRole } from "../middlewares/roles.js";
import { generarMalla, getAgenda, getAgendaDesdeOutlookController, syncAgendaOutlook, listarEmpresasAgenda, updateVisita, eliminarVisita, reprogramarTecnicos, eliminarMalla, crearVisitaManual, crearVisitasManualLote, eliminarVisitasLote, enviarNotaAgenda, } from "../controllers/agenda.controller.js";
import { requireAgendaEditor, getPermisosAgenda, } from "../middlewares/agenda-editores.js";
/*
 * Crear, editar y eliminar visitas (incluidas malla, lotes y reasignación de técnicos):
 * solo técnicos activos con Tecnico.puedeEditarAgenda = true. Antes: rol ADMIN / ADMINISTRACION.
 * Se mantiene el nombre para no tocar cada ruta.
 */
const requireAgendaAdmin = requireAgendaEditor;
export const agendaRouter = Router();
/* Antes las lecturas y el envío de notas no exigían sesión. Agenda: solo internos */
agendaRouter.use(requireAuth);
agendaRouter.use(onlyRole("ADMIN", "ADMINISTRACION", "TECNICO", "VENTAS"));
/* Permisos del usuario actual: el frontend muestra u oculta crear / editar / eliminar */
agendaRouter.get("/permisos", (req, res, next) => {
    Promise.resolve(getPermisosAgenda(req, res)).catch(next);
});
// --- Acciones especiales (antes de los comodines :id) ---
agendaRouter.post("/generar", requireAgendaAdmin, (req, res, next) => {
    Promise.resolve(generarMalla(req, res)).catch(next);
});
agendaRouter.post("/outlook/sync", (req, res, next) => {
    Promise.resolve(syncAgendaOutlook(req, res)).catch(next);
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
agendaRouter.post("/manual/lote", requireAgendaAdmin, (req, res, next) => {
    Promise.resolve(crearVisitasManualLote(req, res)).catch(next);
});
agendaRouter.delete("/lote", requireAgendaAdmin, (req, res, next) => {
    Promise.resolve(eliminarVisitasLote(req, res)).catch(next);
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
//# sourceMappingURL=agenda.routes.js.map