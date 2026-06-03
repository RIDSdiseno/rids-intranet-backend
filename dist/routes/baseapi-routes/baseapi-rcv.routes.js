// src/routes/baseapi-rcv.routes.ts
import { Router } from "express";
import { getComprasRcvBaseApi, getVentasRcvBaseApi, } from "../../controllers/baseapi/baseapi-rcv.controller.js";
import { getBaseApiRcvDashboardController } from "../../controllers/baseapi/baseapi-rcv-dashboard.controller.js";
import { getConciliacionRcv, postConciliarRcv, postDesconciliarRcv, postObservarRcv, } from "../../controllers/baseapi/baseapi-rcv-conciliacion.controller.js";
import { auth } from "../../middlewares/auth.js";
import { onlyRole } from "../../middlewares/roles.js";
const router = Router();
// Lectura: ADMINISTRACION, VENTAS y CLIENTE
router.get("/ventas", auth(), onlyRole("ADMINISTRACION", "VENTAS", "CLIENTE"), getVentasRcvBaseApi);
router.get("/compras", auth(), onlyRole("ADMINISTRACION", "VENTAS", "CLIENTE"), getComprasRcvBaseApi);
router.get("/dashboard", auth(), onlyRole("ADMINISTRACION", "VENTAS", "CLIENTE"), getBaseApiRcvDashboardController);
router.get("/conciliacion", auth(), onlyRole("ADMINISTRACION", "VENTAS", "CLIENTE"), getConciliacionRcv);
// Acciones: solo ADMINISTRACION
router.post("/conciliacion/conciliar", auth(), onlyRole("ADMINISTRACION"), postConciliarRcv);
router.post("/conciliacion/desconciliar", auth(), onlyRole("ADMINISTRACION"), postDesconciliarRcv);
router.post("/conciliacion/observar", auth(), onlyRole("ADMINISTRACION"), postObservarRcv);
export default router;
//# sourceMappingURL=baseapi-rcv.routes.js.map