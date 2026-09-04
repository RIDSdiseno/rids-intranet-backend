// src/routes/baseapi-routes/baseapi-cobranza-automatico.routes.ts
import { Router, } from "express";
import { simularCobranzaAutomatica, prepararCobranzaAutomatica, enviarCobranzaPendiente } from "../../controllers/baseapi/baseapi-cobranza-automatico.controller.js";
import { auth, } from "../../middlewares/auth.js";
import { onlyRole, } from "../../middlewares/roles.js";
const router = Router();
router.post("/simular", auth(), onlyRole("ADMINISTRACION"), simularCobranzaAutomatica);
router.post("/preparar", auth(), onlyRole("ADMINISTRACION"), prepararCobranzaAutomatica);
router.post("/enviar-pendientes", auth(), onlyRole("ADMINISTRACION"), enviarCobranzaPendiente);
export default router;
//# sourceMappingURL=baseapi-cobranza-automatico.routes.js.map