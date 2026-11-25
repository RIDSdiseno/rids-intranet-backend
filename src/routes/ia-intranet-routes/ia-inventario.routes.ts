// Rutas para manejo de análisis de inventario mediante IA, con endpoint para análisis por empresa, delegando la lógica al controlador correspondiente. Todas las rutas están protegidas por autenticación.
import { Router } from "express";
import { requireAuth, validarEmpresaParam } from "../../middlewares/auth.js";
import { onlyRole } from "../../middlewares/roles.js";
import { analizarInventarioEmpresa, getAnalisisInventarioEmpresa } from "../../controllers/controllers-ia-intranet/ia-inventario.controller.js";

const iaInventarioRouter = Router();

/* Todas las rutas exigen sesión (api usa auth(false), que deja pasar sin token) */
iaInventarioRouter.use(requireAuth);
/* Solo internos: cada llamada consume OpenAI y el portal cliente no las usa */
iaInventarioRouter.use(onlyRole("ADMIN", "ADMINISTRACION", "TECNICO", "VENTAS"));
iaInventarioRouter.param("empresaId", validarEmpresaParam);

// GET /api/ai/analisis-inventario/:empresaId
iaInventarioRouter.get("/:empresaId", analizarInventarioEmpresa);

iaInventarioRouter.get("/:empresaId/guardado", getAnalisisInventarioEmpresa);

export default iaInventarioRouter;