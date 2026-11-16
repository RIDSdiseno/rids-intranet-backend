import {
    Router,
} from "express";

import {
    auth,
} from "../../middlewares/auth.js";

import {
    onlyRole,
} from "../../middlewares/roles.js";

import {
    actualizarEstadoMercadoPublicoController,
    convertirMercadoPublicoController,
    listarMercadoPublicoController,
    sincronizarMercadoPublicoController,
} from "../../controllers/mercado-publico/mercado-publico.controller.js";

import {
    listarHitosController,
    sincronizarHitosController,
    sincronizarHitosVigentesController,
    procesarAvisosController
} from "../../controllers/mercado-publico/mercado-publico-hitos.controller.js";

const router =
    Router();

router.use(
    auth()
);

router.get(
    "/",
    onlyRole(
        "ADMIN",
        "ADMINISTRACION",
        "VENTAS"
    ),
    listarMercadoPublicoController
);


router.post(
    "/sincronizar",
    onlyRole(
        "ADMIN",
        "ADMINISTRACION",
        "VENTAS"
    ),
    sincronizarMercadoPublicoController
);


router.patch(
    "/:id/estado",
    onlyRole(
        "ADMIN",
        "ADMINISTRACION",
        "VENTAS"
    ),
    actualizarEstadoMercadoPublicoController
);


router.post(
    "/:id/convertir",
    onlyRole(
        "ADMIN",
        "ADMINISTRACION",
        "VENTAS"
    ),
    convertirMercadoPublicoController
);

/* ==================== HITOS / AVISOS DE LICITACIONES ==================== */

router.post(
    "/avisos/procesar",
    onlyRole(
        "ADMIN",
        "ADMINISTRACION"
    ),
    procesarAvisosController
);

router.post(
    "/hitos/sincronizar-vigentes",
    onlyRole(
        "ADMIN",
        "ADMINISTRACION",
        "VENTAS"
    ),
    sincronizarHitosVigentesController
);


router.get(
    "/:id/hitos",
    onlyRole(
        "ADMIN",
        "ADMINISTRACION",
        "VENTAS"
    ),
    listarHitosController
);


router.post(
    "/:id/hitos/sincronizar",
    onlyRole(
        "ADMIN",
        "ADMINISTRACION",
        "VENTAS"
    ),
    sincronizarHitosController
);

export default router;