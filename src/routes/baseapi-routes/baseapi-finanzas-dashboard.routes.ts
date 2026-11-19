import {
    Router,
} from "express";

import multer from "multer";

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
    postImportarCartola,
    getMovimientosBanco,
    postConfirmarMovimiento,
    postConfirmarPerfectos,
    postDeshacerMovimiento,
    postDescartarMovimiento,
    postRestaurarMovimiento,
} from "../../controllers/baseapi/baseapi-finanzas-banco.controller.js";

import {
    getConfigCobranzaAuto,
    patchConfigCobranzaAuto,
    getCalendarioCobranzaAuto,
    getColaCobranzaAuto,
    postPrepararCobranzaAuto,
    postEnviarCobranzaAuto,
    postCancelarRecordatorioCobranzaAuto,
} from "../../controllers/baseapi/baseapi-finanzas-cobranza-auto.controller.js";

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

const subirCartola = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 5 * 1024 * 1024 },
    fileFilter: (_req, file, cb) => cb(null, /\.(xlsx|xls|csv)$/i.test(file.originalname)),
});

router.post("/banco/importar", auth(), rolesClientes, subirCartola.single("archivo"), postImportarCartola);
router.get("/banco/movimientos", auth(), rolesClientes, getMovimientosBanco);
router.post("/banco/movimientos/confirmar-perfectos", auth(), rolesClientes, postConfirmarPerfectos);
router.post("/banco/movimientos/:id/confirmar", auth(), rolesClientes, postConfirmarMovimiento);
router.post("/banco/movimientos/:id/deshacer", auth(), rolesClientes, postDeshacerMovimiento);
router.post("/banco/movimientos/:id/descartar", auth(), rolesClientes, postDescartarMovimiento);
router.post("/banco/movimientos/:id/restaurar", auth(), rolesClientes, postRestaurarMovimiento);

const soloAdministracion = onlyRole("ADMINISTRACION");

router.get("/cxc/cobranza-auto/config", auth(), rolesClientes, getConfigCobranzaAuto);
router.patch("/cxc/cobranza-auto/config/:empresa", auth(), soloAdministracion, patchConfigCobranzaAuto);
router.get("/cxc/cobranza-auto/calendario", auth(), rolesClientes, getCalendarioCobranzaAuto);
router.get("/cxc/cobranza-auto/cola", auth(), rolesClientes, getColaCobranzaAuto);
router.post("/cxc/cobranza-auto/preparar", auth(), soloAdministracion, postPrepararCobranzaAuto);
router.post("/cxc/cobranza-auto/enviar", auth(), soloAdministracion, postEnviarCobranzaAuto);
router.post("/cxc/cobranza-auto/cola/:id/cancelar", auth(), soloAdministracion, postCancelarRecordatorioCobranzaAuto);

export default router;