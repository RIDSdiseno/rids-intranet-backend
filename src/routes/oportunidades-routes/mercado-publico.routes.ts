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


export default router;