// src/routes/entidades.routes.ts
import { Router } from "express";
import { seedEntidadesRIDS, seedEntidadesECONNET, createEntidad, getEntidades, getEntidadById, updateEntidad, deleteEntidad, } from "../controllers/entidades.controller.js";
const entidadesRouter = Router();
/* ============================
   RUTAS DE POBLADO DE ENTIDADES
   ============================ */
// Poblar entidades RIDS
entidadesRouter.post("/seed-rids", seedEntidadesRIDS);
// Poblar entidades ECONNET
entidadesRouter.post("/seed-ECONNET", seedEntidadesECONNET);
/* ============================
   CRUD ROUTES
============================ */
entidadesRouter.post("/", createEntidad);
entidadesRouter.get("/", getEntidades);
entidadesRouter.get("/:id", getEntidadById);
entidadesRouter.put("/:id", updateEntidad);
entidadesRouter.delete("/:id", deleteEntidad);
export default entidadesRouter;
//# sourceMappingURL=entidades.routes.js.map