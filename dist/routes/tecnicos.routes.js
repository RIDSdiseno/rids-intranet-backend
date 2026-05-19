// src/routes/tecnicos.routes.ts
import express from "express";
import { listTecnicos, listUsuarios, updateTecnico, deleteTecnico, createTecnico, } from "../controllers/tecnicos.controller.js";
import { auth } from "../middlewares/auth.js";
import { onlyRole } from "../middlewares/roles.js";
const router = express.Router();
// Selector de técnicos para filtros.
// Lo puede usar CLIENTE, pero el controller solo devuelve datos básicos.
router.get("/select", auth(), onlyRole("ADMIN", "ADMINISTRACION", "TECNICO", "VENTAS", "CLIENTE"), listTecnicos);
// Lectura administración: ADMIN, ADMINISTRACION, TECNICO y VENTAS
router.get("/", auth(), onlyRole("ADMIN", "ADMINISTRACION", "TECNICO", "VENTAS"), listTecnicos);
router.get("/usuarios", auth(), onlyRole("ADMIN", "ADMINISTRACION", "TECNICO", "VENTAS"), listUsuarios);
// Escritura: solo ADMIN y ADMINISTRACION
router.put("/:id", auth(), onlyRole("ADMIN", "ADMINISTRACION"), updateTecnico);
router.delete("/:id", auth(), onlyRole("ADMIN", "ADMINISTRACION"), deleteTecnico);
router.post("/", auth(), onlyRole("ADMIN", "ADMINISTRACION"), createTecnico);
export default router;
//# sourceMappingURL=tecnicos.routes.js.map