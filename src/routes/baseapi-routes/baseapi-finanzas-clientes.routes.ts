import {
    Router,
} from "express";

import {
    getFinanzasClientes,
} from "../../controllers/baseapi/baseapi-finanzas-clientes.controller.js";

import {
    auth,
} from "../../middlewares/auth.js";

import {
    onlyRole,
} from "../../middlewares/roles.js";

const router =
    Router();

router.get(
    "/clientes",

    auth(),

    onlyRole(
        "ADMINISTRACION"
    ),

    getFinanzasClientes
);

export default router;