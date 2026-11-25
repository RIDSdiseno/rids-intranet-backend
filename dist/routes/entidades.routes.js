// src/routes/entidades.routes.ts
import { Router } from "express";
import { requireAuth, soloLecturaCliente } from "../middlewares/auth.js";
import { onlyRole } from "../middlewares/roles.js";
import { seedEntidadesRIDS, seedEntidadesECONNET, createEntidad, getEntidades, getEntidadById, updateEntidad, deleteEntidad, } from "../controllers/entidades.controller.js";
const entidadesRouter = Router();
/* Antes este router no tenía autenticación: cualquiera podía listar, crear,
   editar y borrar entidades y ejecutar los seeds.
   - Exige sesión.
   - CLIENTE: solo lectura y solo entidades de su empresa (filtro en el controller). */
entidadesRouter.use(requireAuth);
entidadesRouter.use(soloLecturaCliente);
/* ============================
   RUTAS DE POBLADO DE ENTIDADES
   ============================ */
// Poblar entidades RIDS
entidadesRouter.post("/seed-rids", onlyRole("ADMIN", "ADMINISTRACION"), seedEntidadesRIDS);
// Poblar entidades ECONNET
entidadesRouter.post("/seed-econnet", onlyRole("ADMIN", "ADMINISTRACION"), seedEntidadesECONNET);
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