// src/routes/baseapi-routes/baseapi-factura-envio-automatico.routes.ts
import { Router, } from "express";
import { simularEnvioFacturas, prepararEnvioFacturas, enviarFacturasPendientes } from "../../controllers/baseapi/baseapi-factura-envio-automatico.controller.js";
import { auth, } from "../../middlewares/auth.js";
import { onlyRole, } from "../../middlewares/roles.js";
const router = Router();
/* =========================================================
   SIMULACIÓN
========================================================= */
router.post("/simular", auth(), onlyRole("ADMINISTRACION"), simularEnvioFacturas);
/* =========================================================
   PREPARAR
========================================================= */
router.post("/preparar", auth(), onlyRole("ADMINISTRACION"), prepararEnvioFacturas);
/* =========================================================
   ENVIAR PENDIENTES
========================================================= */
router.post("/enviar-pendientes", auth(), onlyRole("ADMINISTRACION"), enviarFacturasPendientes);
export default router;
//# sourceMappingURL=baseapi-factura-envio-automatico.routes.js.map