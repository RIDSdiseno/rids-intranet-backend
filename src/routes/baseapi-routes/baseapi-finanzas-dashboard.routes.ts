import {
    Router,
} from "express";

import {
    getFinanzasDashboard,
} from "../../controllers/baseapi/baseapi-finanzas-dashboard.controller.js";

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
        "ADMINISTRACION"
    ),
    getFinanzasDashboard
);

export default router;