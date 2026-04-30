// src/modules/sii-api/routes/sii-api.routes.ts
import { Router } from "express";
import { getRcvVentas, getRcvCompras } from "../controllers/sii-rcv.controller.js";
const router = Router();
// RCV
router.get("/rcv/ventas", getRcvVentas);
router.get("/rcv/compras", getRcvCompras);
export default router;
//# sourceMappingURL=sii-api.routes.js.map