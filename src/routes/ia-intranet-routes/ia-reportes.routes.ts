import { Router } from "express";
import { requireAuth, validarEmpresaParam } from "../../middlewares/auth.js";
import { onlyRole } from "../../middlewares/roles.js";
import { generarInformeOperativoIA } from "../../controllers/controllers-ia-intranet/ia-reportes.controller.js";
import { generarInformeWordIABeta } from "../../controllers/controllers-ia-intranet/ia-reportes-docx-beta.controller.js";

const iaReportesRouter = Router();

/* Todas las rutas exigen sesión (api usa auth(false), que deja pasar sin token) */
iaReportesRouter.use(requireAuth);
/* Solo internos: cada llamada consume OpenAI y el portal cliente no las usa */
iaReportesRouter.use(onlyRole("ADMIN", "ADMINISTRACION", "TECNICO", "VENTAS"));
iaReportesRouter.param("empresaId", validarEmpresaParam);

iaReportesRouter.get(
  "/informe-operativo/:empresaId/:year/:month",
  generarInformeOperativoIA
);

iaReportesRouter.get(
  "/word-beta/:empresaId/:year/:month",
  generarInformeWordIABeta
);

export default iaReportesRouter;
