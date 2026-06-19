import { Router } from "express";
import {
  receiveEquipoAgentInventory,
  listEquiposAgent,
  getEquipoAgentById,
} from "../../controllers/controllers-agente-inventario/equipo-agent.controller.js";
import { auth, onlyOwnEmpresa } from "../../middlewares/auth.js";

const router = Router();

/**
 * Público para el agente Windows.
 * Se protege con x-agent-api-key dentro del controller.
 */
router.post("/inventory", receiveEquipoAgentInventory);

/**
 * Protegido para el CRM.
 */
router.get("/", auth(false), onlyOwnEmpresa(), listEquiposAgent);
router.get("/:id", auth(false), onlyOwnEmpresa(), getEquipoAgentById);

export default router;