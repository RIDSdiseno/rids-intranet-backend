// src/routes/detalle-trabajo-gestioo.routes.ts
import { Router } from "express";
import { auth } from "../middlewares/auth.js";
import { onlyRole } from "../middlewares/roles.js";
import { onlyOwnEmpresa } from "../middlewares/auth.js";
import { createDetalleTrabajo, getDetallesTrabajo, getDetalleTrabajoById, updateDetalleTrabajo, deleteDetalleTrabajo, getDetallesTrabajoByEquipo, generarCotizacionDesdeOrden, } from "../controllers/detalle-trabajo-gestioo.controller.js";
const detalleTrabajoGestiooRouter = Router();
const ROLES_INTERNOS = ["ADMIN", "ADMINISTRACION", "TECNICO", "VENTAS"];
const ROLES_ADMIN = ["ADMIN", "ADMINISTRACION"];
// Listar — auth requerido; CLIENTE filtra por su empresa (lógica en controller)
detalleTrabajoGestiooRouter.get("/", auth(), onlyOwnEmpresa(), getDetallesTrabajo);
// Detalle — auth requerido; CLIENTE solo ve órdenes de su empresa
detalleTrabajoGestiooRouter.get("/:id", auth(), onlyOwnEmpresa(), getDetalleTrabajoById);
// Por equipo — solo internos
detalleTrabajoGestiooRouter.get("/equipo/:equipoId", auth(), onlyRole(...ROLES_INTERNOS), getDetallesTrabajoByEquipo);
// Crear — solo internos
detalleTrabajoGestiooRouter.post("/", auth(), onlyRole(...ROLES_INTERNOS), createDetalleTrabajo);
// Editar — solo internos
detalleTrabajoGestiooRouter.put("/:id", auth(), onlyRole(...ROLES_INTERNOS), updateDetalleTrabajo);
// Eliminar — solo ADMIN
detalleTrabajoGestiooRouter.delete("/:id", auth(), onlyRole(...ROLES_ADMIN), deleteDetalleTrabajo);
// Generar cotización desde orden — solo internos
detalleTrabajoGestiooRouter.post("/ordenes/:numeroOrden/generar-cotizacion", auth(), onlyRole(...ROLES_INTERNOS), generarCotizacionDesdeOrden);
export default detalleTrabajoGestiooRouter;
//# sourceMappingURL=detalle-trabajo-gestioo.routes.js.map