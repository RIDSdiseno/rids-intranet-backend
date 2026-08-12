// src/routes/equipos-adicionales/equipo-adicional.routes.ts
import { Router } from "express";
import { createEquipoAdicional, deleteEquipoAdicional, getEquipoAdicional, listAdicionalesByEquipo, listEquipoAdicionales, updateEquipoAdicional, } from "../../controllers/equipos-adicionales/equipo-adicional.controller.js";
const router = Router();
router.get("/", listEquipoAdicionales);
router.get("/equipo/:equipoId", listAdicionalesByEquipo);
router.get("/:id", getEquipoAdicional);
router.post("/", createEquipoAdicional);
router.patch("/:id", updateEquipoAdicional);
router.delete("/:id", deleteEquipoAdicional);
export default router;
//# sourceMappingURL=equipo-adicional.routes.js.map