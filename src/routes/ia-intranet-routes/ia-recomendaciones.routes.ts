// Rutas para manejo de recomendaciones operativas mediante IA, con endpoint para generación de recomendaciones por empresa, año y mes, delegando la lógica al controlador correspondiente. Todas las rutas están protegidas por autenticación.
import { Router } from "express";
import { requireAuth, validarEmpresaParam } from "../../middlewares/auth.js";
import { onlyRole } from "../../middlewares/roles.js";
import { generarRecomendacionesOperativasIA } from "../../controllers/controllers-ia-intranet/ia-recomendaciones.controller.js";

const iaRecomendacionesRouter = Router();

/* Todas las rutas exigen sesión (api usa auth(false), que deja pasar sin token) */
iaRecomendacionesRouter.use(requireAuth);
/* Solo internos: cada llamada consume OpenAI y el portal cliente no las usa */
iaRecomendacionesRouter.use(onlyRole("ADMIN", "ADMINISTRACION", "TECNICO", "VENTAS"));
iaRecomendacionesRouter.param("empresaId", validarEmpresaParam);

iaRecomendacionesRouter.get(
  "/recomendaciones-operativas/:empresaId/:year/:month",
  generarRecomendacionesOperativasIA
);

export default iaRecomendacionesRouter;