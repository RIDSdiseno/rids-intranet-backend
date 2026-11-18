import {
    Router,
} from "express";

import {
    getFinanzasDashboard,
} from "../../controllers/baseapi/baseapi-finanzas-dashboard.controller.js";

import {
    getResumenCxc,
    getDocumentosCxc,
} from "../../controllers/baseapi/baseapi-finanzas-cxc.controller.js";

import {
    getOpcionesEnvioCxc,
    postEnviarFacturaCxc,
    postEnviarRecordatorioCxc,
} from "../../controllers/baseapi/baseapi-finanzas-cxc-envios.controller.js";

import {
    getClientesCxc,
    getFichaClienteCxc,
    patchConfigClienteCxc,
    putContactoClienteCxc,
    deleteContactoClienteCxc,
} from "../../controllers/baseapi/baseapi-finanzas-clientes-cxc.controller.js";

import {
    getPagosDocumentoCxc,
    postAbonoCxc,
    deleteAbonoCxc,
} from "../../controllers/baseapi/baseapi-finanzas-cxc-pagos.controller.js";

import {
    auth,
} from "../../middlewares/auth.js";

import {
    onlyRole,
} from "../../middlewares/roles.js";


const router =
    Router();


router.get(
    "/dashboard",

    auth(),

    onlyRole(
        "ADMINISTRACION",
        "VENTAS"
    ),

    getFinanzasDashboard
);

router.get(
    "/cxc/resumen",

    auth(),

    onlyRole(
        "ADMINISTRACION",
        "VENTAS"
    ),

    getResumenCxc
);

router.get(
    "/cxc/documentos",

    auth(),

    onlyRole(
        "ADMINISTRACION",
        "VENTAS"
    ),

    getDocumentosCxc
);

/* Fase 2b: reenviar factura y recordatorio manual */

router.get(
    "/cxc/envios/opciones",

    auth(),

    onlyRole(
        "ADMINISTRACION",
        "VENTAS"
    ),

    getOpcionesEnvioCxc
);

router.post(
    "/cxc/envios/factura",

    auth(),

    onlyRole(
        "ADMINISTRACION",
        "VENTAS"
    ),

    postEnviarFacturaCxc
);

router.post(
    "/cxc/envios/recordatorio",

    auth(),

    onlyRole(
        "ADMINISTRACION",
        "VENTAS"
    ),

    postEnviarRecordatorioCxc
);

/* Fase 3a: Clientes unificado */

const rolesClientes = onlyRole(
    "ADMINISTRACION",
    "VENTAS"
);

router.get("/cxc/clientes", auth(), rolesClientes, getClientesCxc);
router.get("/cxc/clientes/:rut", auth(), rolesClientes, getFichaClienteCxc);
router.patch("/cxc/clientes/:rut/config", auth(), rolesClientes, patchConfigClienteCxc);
router.put("/cxc/clientes/:rut/contactos", auth(), rolesClientes, putContactoClienteCxc);
router.delete("/cxc/clientes/:rut/contactos", auth(), rolesClientes, deleteContactoClienteCxc);

router.get("/cxc/pagos", auth(), rolesClientes, getPagosDocumentoCxc);
router.post("/cxc/pagos", auth(), rolesClientes, postAbonoCxc);
router.delete("/cxc/pagos/:id", auth(), rolesClientes, deleteAbonoCxc);

export default router;