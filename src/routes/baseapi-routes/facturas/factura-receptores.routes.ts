import {
    Router,
} from "express";

import {
    getReceptoresFacturacion,
    getReceptorFacturacion,
    patchReceptorFacturacion,
    postContactoReceptor,
    patchContactoReceptor,
    deleteContactoReceptor,
    postReceptorFacturacion,
    deleteReceptorFacturacion,
} from "../../../controllers/baseapi/facturas/factura-receptores.controller.js";

import {
    postSincronizarReceptoresFacturacionCrm,
} from "../../../controllers/baseapi/receptores-sync-crm.controller.js";

import {
    auth,
} from "../../../middlewares/auth.js";

import {
    onlyRole,
} from "../../../middlewares/roles.js";


const router =
    Router();


router.use(
    auth()
);


router.use(
    onlyRole(
        "ADMINISTRACION",
        "VENTAS"
    )
);


router.get(
    "/",
    getReceptoresFacturacion
);


router.post(
    "/",
    postReceptorFacturacion
);

/* Sincronizar empresas y contactos del CRM: ?aplicar=1 aplica; sin él, simula. Antes de /:id */
router.post(
    "/sincronizar-crm",
    postSincronizarReceptoresFacturacionCrm
);

router.get(
    "/:id",
    getReceptorFacturacion
);


router.patch(
    "/:id",
    patchReceptorFacturacion
);


router.delete(
    "/:id",
    deleteReceptorFacturacion
);


router.post(
    "/:id/contactos",
    postContactoReceptor
);


router.patch(
    "/:id/contactos/:contactoId",
    patchContactoReceptor
);


router.delete(
    "/:id/contactos/:contactoId",
    deleteContactoReceptor
);


export default router;