// src/routes/baseapi-routes/facturas/factura-receptores.routes.ts
import { Router, } from "express";
import { getReceptoresFacturacion, getReceptorFacturacion, patchReceptorFacturacion, postContactoReceptor, patchContactoReceptor, deleteContactoReceptor, postReceptorFacturacion, deleteReceptorFacturacion } from "../../../controllers/baseapi/facturas/factura-receptores.controller.js";
const router = Router();
router.get("/", getReceptoresFacturacion);
router.post("/", postReceptorFacturacion);
router.get("/:id", getReceptorFacturacion);
router.patch("/:id", patchReceptorFacturacion);
router.delete("/:id", deleteReceptorFacturacion);
router.post("/:id/contactos", postContactoReceptor);
router.patch("/:id/contactos/:contactoId", patchContactoReceptor);
router.delete("/:id/contactos/:contactoId", deleteContactoReceptor);
export default router;
//# sourceMappingURL=factura-receptores.routes.js.map