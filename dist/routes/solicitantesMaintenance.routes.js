// src/routes/solicitantesMaintenance.routes.ts
import { Router } from "express";
import { auth } from "../middlewares/auth.js";
import { onlyRole } from "../middlewares/roles.js";
import { cleanupSolicitantesNoCuenta } from "../controllers/solicitantesMaintenance.controller.js";
const router = Router();
/**
 * POST /api/solicitantes/cleanup/no-cuenta
 * body: { empresaId?: number, mode?: "deactivate" | "purge" }
 *
 * - Con empresaId: limpia esa empresa
 * - Sin empresaId: limpia todas las empresas
 *
 * mode:
 * - "deactivate" (default): isActive=false (recomendado)
 * - "purge": borra solicitante limpiando FKs (más pesado)
 */
/* Solo ADMIN y ADMINISTRACION: sin empresaId limpia (o borra con mode=purge) TODAS las empresas */
router.post("/solicitantes/cleanup/no-cuenta", auth(), onlyRole("ADMIN", "ADMINISTRACION"), cleanupSolicitantesNoCuenta);
export default router;
//# sourceMappingURL=solicitantesMaintenance.routes.js.map