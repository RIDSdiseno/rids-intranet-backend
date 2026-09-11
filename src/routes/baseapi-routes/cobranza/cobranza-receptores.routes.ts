// src/routes/baseapi-routes/cobranza/cobranza-receptores.routes.ts
import {
    Router,
} from "express";

import {
    deleteContactoCobranza,
    deleteReceptorCobranza,
    getReceptorCobranza,
    getReceptorCobranzaPorRut,
    getReceptoresCobranza,
    patchContactoCobranza,
    patchReceptorCobranza,
    postContactoCobranza,
    postCopiarContactosFacturacion,
    postReceptorCobranza,
} from "../../../controllers/baseapi/cobranza/cobranza-receptores.controller.js";

const router =
    Router();

/*
 * IMPORTANTE:
 * /rut/:rut debe ir ANTES de /:id.
 */
router.get(
    "/rut/:rut",
    getReceptorCobranzaPorRut
);

router.get(
    "/",
    getReceptoresCobranza
);

router.post(
    "/",
    postReceptorCobranza
);

router.get(
    "/:id",
    getReceptorCobranza
);

router.patch(
    "/:id",
    patchReceptorCobranza
);

router.delete(
    "/:id",
    deleteReceptorCobranza
);

router.post(
    "/:id/contactos",
    postContactoCobranza
);

router.patch(
    "/:id/contactos/:contactoId",
    patchContactoCobranza
);

router.delete(
    "/:id/contactos/:contactoId",
    deleteContactoCobranza
);

router.post(
    "/:id/copiar-contactos-facturacion",
    postCopiarContactosFacturacion
);

export default router;