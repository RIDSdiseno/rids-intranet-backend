// src/routes/baseapi-routes/baseapi-cobranza-automatico.routes.ts

import {
    Router,
} from "express";

import {
    simularCobranzaAutomatica,
} from "../../controllers/baseapi/baseapi-cobranza-automatico.controller.js";

import {
    auth,
} from "../../middlewares/auth.js";

import {
    onlyRole,
} from "../../middlewares/roles.js";

const router =
    Router();

router.post(
    "/simular",
    auth(),
    onlyRole("ADMINISTRACION"),
    simularCobranzaAutomatica
);

export default router;