import { Router } from "express";
import { auth, onlyOwnEmpresa } from "../middlewares/auth.js";
import { onlyRole } from "../middlewares/roles.js";
import { listVisitas, getVisitasMetrics, visitasMetrics, getVisitasFilters, createVisita, getVisitaById, updateVisita, deleteVisita, closeVisita, getVisitasDashboard, getVisitasResumenDiario, } from "../controllers/visitas.controller.js";
export const visitasRouter = Router();
/* ======================================================
   Endpoints estáticos: siempre antes de /:id
====================================================== */
/* ========= Métricas ========= */
visitasRouter.get("/metrics", auth(), (req, res, next) => {
    Promise.resolve(visitasMetrics(req, res)).catch(next);
});
visitasRouter.get("/metrics/summary", auth(), (req, res, next) => {
    Promise.resolve(getVisitasMetrics(req, res)).catch(next);
});
/* ========= Filtros ========= */
visitasRouter.get("/filters", auth(), (req, res, next) => {
    Promise.resolve(getVisitasFilters(req, res)).catch(next);
});
/* ========= Dashboard ========= */
visitasRouter.get("/dashboard", auth(), onlyOwnEmpresa(), (req, res, next) => {
    Promise.resolve(getVisitasDashboard(req, res)).catch(next);
});
/* ========= Agenda y atenciones del día ========= */
visitasRouter.get("/resumen-diario", auth(), onlyOwnEmpresa(), (req, res, next) => {
    Promise.resolve(getVisitasResumenDiario(req, res)).catch(next);
});
/* ======================================================
   Listado y creación
====================================================== */
/* ========= Listado ========= */
visitasRouter.get("/", auth(), onlyOwnEmpresa(), (req, res, next) => {
    Promise.resolve(listVisitas(req, res)).catch(next);
});
/* ========= Crear: todos menos CLIENTE ========= */
visitasRouter.post("/", auth(), onlyRole("ADMIN", "ADMINISTRACION", "TECNICO", "VENTAS"), (req, res, next) => {
    Promise.resolve(createVisita(req, res)).catch(next);
});
/* ======================================================
   Rutas dinámicas con :id
====================================================== */
/* ========= Obtener por ID ========= */
visitasRouter.get("/:id", auth(), onlyOwnEmpresa(), (req, res, next) => {
    Promise.resolve(getVisitaById(req, res)).catch(next);
});
/* ========= Actualizar ========= */
visitasRouter.patch("/:id", auth(), onlyRole("ADMIN", "ADMINISTRACION"), (req, res, next) => {
    Promise.resolve(updateVisita(req, res)).catch(next);
});
/* ========= Eliminar ========= */
visitasRouter.delete("/:id", auth(), onlyRole("ADMIN", "ADMINISTRACION"), (req, res, next) => {
    Promise.resolve(deleteVisita(req, res)).catch(next);
});
/* ========= Cerrar visita ========= */
visitasRouter.post("/:id/close", auth(), onlyRole("ADMIN", "ADMINISTRACION", "TECNICO", "VENTAS"), (req, res, next) => {
    Promise.resolve(closeVisita(req, res)).catch(next);
});
//# sourceMappingURL=visitas.routes.js.map