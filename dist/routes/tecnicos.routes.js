import express from "express";
import { listTecnicos, listUsuarios, updateTecnico, deleteTecnico, createTecnico, } from "../controllers/tecnicos.controller.js";
import { auth } from "../middlewares/auth.js";
const router = express.Router();
router.get("/", auth(), listTecnicos);
router.get("/usuarios", auth(), listUsuarios);
router.put("/:id", auth(), updateTecnico);
router.delete("/:id", auth(), deleteTecnico);
router.post("/", auth(), createTecnico);
export default router;
//# sourceMappingURL=tecnicos.routes.js.map