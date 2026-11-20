// src/routes/routes-empresas/portal-cliente.routes.ts
// Grupos de empresas · G2a: endpoints propios del portal cliente.
import { Router } from "express";

import { getMisEmpresasCliente } from "../../controllers/controllers-empresas/portal-cliente.controller.js";
import { onlyRole } from "../../middlewares/roles.js";
import { auth } from "../../middlewares/auth.js";

export const portalClienteRouter = Router();

portalClienteRouter.use(auth());

portalClienteRouter.get("/mis-empresas", onlyRole("CLIENTE"), getMisEmpresasCliente);

export default portalClienteRouter;