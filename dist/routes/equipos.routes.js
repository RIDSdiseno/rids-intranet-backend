// src/routes/equipos.routes.ts
import { Router } from "express";
import { listEquipos, createEquipo, getEquipoById, updateEquipo, deleteEquipo, } from "../controllers/equipos.controller.js";
export const equiposRouter = Router();
equiposRouter.get("/", listEquipos);
equiposRouter.post("/", createEquipo);
equiposRouter.get("/:id", getEquipoById);
equiposRouter.put("/:id", updateEquipo);
equiposRouter.delete("/:id", deleteEquipo);
//# sourceMappingURL=equipos.routes.js.map