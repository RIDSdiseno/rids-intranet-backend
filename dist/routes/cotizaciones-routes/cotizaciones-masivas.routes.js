// src/routes/cotizaciones-routes/cotizaciones-masivas.routes.ts
import { Router } from "express";
import { auth } from "../../middlewares/auth.js";
import { listarPlantillasMasivas, crearPlantillaMasiva, generarCotizacionesDesdePlantilla, desactivarPlantillaMasiva, createCotizacionesMasivas, actualizarPlantillaMasiva } from "../../controllers/controllers-cotizaciones/cotizaciones-masivas.controller.js";
const router = Router();
router.get("/", auth(true), listarPlantillasMasivas);
router.post("/", auth(true), crearPlantillaMasiva);
router.post("/generar-directo", auth(true), createCotizacionesMasivas);
router.post("/:id/generar", auth(true), generarCotizacionesDesdePlantilla);
router.put("/:id", auth(true), actualizarPlantillaMasiva);
router.delete("/:id", auth(true), desactivarPlantillaMasiva);
export default router;
//# sourceMappingURL=cotizaciones-masivas.routes.js.map