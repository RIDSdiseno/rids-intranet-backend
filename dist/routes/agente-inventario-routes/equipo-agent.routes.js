import { Router } from "express";
import { receiveEquipoAgentInventory, listEquiposAgent, getEquipoAgentById, } from "../../controllers/controllers-agente-inventario/equipo-agent.controller.js";
import { getEquipoAgentDashboard, } from "../../controllers/controllers-agente-inventario/equipo-agent-dashboard.controller.js";
import { auth, onlyOwnEmpresa } from "../../middlewares/auth.js";
const router = Router();
/**
 * Público para el agente Windows.
 * Se protege con x-agent-api-key dentro del controller.
 */
router.post("/inventory", receiveEquipoAgentInventory);
router.get("/dashboard", auth(false), getEquipoAgentDashboard);
/**
 * Protegido para el CRM.
 */
router.get("/", auth(false), onlyOwnEmpresa(), listEquiposAgent);
router.get("/:id", auth(false), onlyOwnEmpresa(), getEquipoAgentById);
export default router;
//# sourceMappingURL=equipo-agent.routes.js.map