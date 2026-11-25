import {
  Router,
} from "express";

import {
  enviarMasivo,
  obtenerEstadoEnvioMasivo,
  crearPlantilla,
  listarPlantillas,
  obtenerPlantilla,
  eliminarPlantilla,
  actualizarPlantilla,
  obtenerFirmaRemitente
} from "../controllers/correos-masivos.controller.js";

import {
  uploadPlantillaCorreo,
} from "../service/correos-masivos/correos-masivos-upload.middleware.js";

import { requireAuth } from "../middlewares/auth.js";
import { onlyRole } from "../middlewares/roles.js";

const correoMasivoRouter =
  Router();

/* Antes público: cualquiera podía enviar correos masivos desde la casilla de RIDS
 y leer o borrar plantillas. Solo internos (el menú del CLIENTE no muestra el mailer). */
correoMasivoRouter.use(requireAuth);
correoMasivoRouter.use(onlyRole("ADMIN", "ADMINISTRACION", "TECNICO", "VENTAS"));

// =====================================================
// PLANTILLAS
// =====================================================

correoMasivoRouter.post(
  "/plantillas",
  uploadPlantillaCorreo.single(
    "file"
  ),
  crearPlantilla
);

correoMasivoRouter.get(
  "/plantillas",
  listarPlantillas
);

correoMasivoRouter.get(
  "/plantillas/:id",
  obtenerPlantilla
);

correoMasivoRouter.delete(
  "/plantillas/:id",
  eliminarPlantilla
);

correoMasivoRouter.patch(
  "/plantillas/:id",
  actualizarPlantilla
);

correoMasivoRouter.get(
  "/firma-remitente",
  obtenerFirmaRemitente
);


// =====================================================
// ENVÍOS
// =====================================================

correoMasivoRouter.post(
  "/enviar-masivo",
  enviarMasivo
);

correoMasivoRouter.get(
  "/enviar-masivo/status/:id",
  obtenerEstadoEnvioMasivo
);

export default correoMasivoRouter;