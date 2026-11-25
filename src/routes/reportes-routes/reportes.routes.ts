import { Router } from "express";
import { requireAuth, validarEmpresaParam } from "../../middlewares/auth.js";
import { getReporteEmpresa } from "../../controllers/controllers-reportes/reportes.controller.js";

const router = Router();

/* Todas las rutas exigen sesión (api usa auth(false), que deja pasar sin token) */
router.use(requireAuth);
router.param("empresaId", validarEmpresaParam);

// Web / Dashboard
router.get("/empresa/:empresaId", getReporteEmpresa);

export default router;
