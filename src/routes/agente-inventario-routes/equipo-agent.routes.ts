import { Router } from "express";
import {
    receiveEquipoAgentInventory,
    listEquiposAgent,
    getEquipoAgentById,
} from "../../controllers/controllers-agente-inventario/equipo-agent.controller.js";
import {
    getEquipoAgentDashboard,
} from "../../controllers/controllers-agente-inventario/equipo-agent-dashboard.controller.js";

import {
    receiveEquipoAgentUninstall,
} from "../../controllers/controllers-agente-inventario/equipo-agent-uninstall.controller.js";

import {
    registrarAgente,
    crearCodigoInstalacion,
    listarCodigosInstalacion,
    revocarCodigoInstalacion,
    revocarTokenEquipo,
} from "../../controllers/controllers-agente-inventario/equipo-agent-registro.controller.js";
import { rateLimit } from "express-rate-limit";

import { auth, onlyOwnEmpresa } from "../../middlewares/auth.js";
import { onlyRole } from "../../middlewares/roles.js";

/* Registro del agente: limita intentos de códigos por IP (30 cada 15 min) */
const limiteRegistro = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 30,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    message: { ok: false, error: "Demasiados intentos. Espere unos minutos." },
});

const router = Router();

/**
 * Público para el agente Windows.
 * Se protege con x-agent-api-key dentro del controller.
 */
router.post("/inventory", receiveEquipoAgentInventory);

/**
 * Aviso del desinstalador: marca el agente del equipo como desinstalado.
 * Mismo esquema de protección que /inventory (x-agent-api-key).
 */
router.post("/uninstall", receiveEquipoAgentUninstall);

/**
 * Registro del agente: entrega el token del equipo a cambio de un código de
 * instalación (o, una sola vez, de la key global en equipos ya instalados).
 */
router.post("/registro", limiteRegistro, registrarAgente);

/**
 * Códigos de instalación (dashboard de agentes) y revocación de tokens.
 */
router.get("/codigos", auth(), onlyRole("ADMIN", "ADMINISTRACION", "TECNICO"), listarCodigosInstalacion);
router.post("/codigos", auth(), onlyRole("ADMIN", "ADMINISTRACION", "TECNICO"), crearCodigoInstalacion);
router.post("/codigos/:id/revocar", auth(), onlyRole("ADMIN", "ADMINISTRACION", "TECNICO"), revocarCodigoInstalacion);
router.post("/tokens/equipo/:id/revocar", auth(), onlyRole("ADMIN", "ADMINISTRACION"), revocarTokenEquipo);

router.get("/dashboard",
    auth(),
    getEquipoAgentDashboard
);

/**
 * Protegido para el CRM.
 */
router.get("/", auth(), onlyOwnEmpresa(), listEquiposAgent);
router.get("/:id", auth(), onlyOwnEmpresa(), getEquipoAgentById);

export default router;