// src/routes/solicitantesMaintenance.routes.ts
import { Router } from "express";
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
router.post("/solicitantes/cleanup/no-cuenta", cleanupSolicitantesNoCuenta);
export default router;
//# sourceMappingURL=solicitantesMaintenance.routes.js.map