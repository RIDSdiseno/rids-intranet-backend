import { Router, } from "express";
import { enviarMasivo, obtenerEstadoEnvioMasivo, crearPlantilla, listarPlantillas, obtenerPlantilla, eliminarPlantilla, actualizarPlantilla, obtenerFirmaRemitente } from "../controllers/correos-masivos.controller.js";
import { uploadPlantillaCorreo, } from "../service/correos-masivos/correos-masivos-upload.middleware.js";
const correoMasivoRouter = Router();
// =====================================================
// PLANTILLAS
// =====================================================
correoMasivoRouter.post("/plantillas", uploadPlantillaCorreo.single("file"), crearPlantilla);
correoMasivoRouter.get("/plantillas", listarPlantillas);
correoMasivoRouter.get("/plantillas/:id", obtenerPlantilla);
correoMasivoRouter.delete("/plantillas/:id", eliminarPlantilla);
correoMasivoRouter.patch("/plantillas/:id", actualizarPlantilla);
correoMasivoRouter.get("/firma-remitente", obtenerFirmaRemitente);
// =====================================================
// ENVÍOS
// =====================================================
correoMasivoRouter.post("/enviar-masivo", enviarMasivo);
correoMasivoRouter.get("/enviar-masivo/status/:id", obtenerEstadoEnvioMasivo);
export default correoMasivoRouter;
//# sourceMappingURL=correos-masivos.routes.js.map