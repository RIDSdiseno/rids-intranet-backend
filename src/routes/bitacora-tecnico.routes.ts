import { Router } from "express";
import {
    crearBitacoraTecnico,
    obtenerBitacorasTecnico,
    obtenerBitacoraTecnicoPorId,
    actualizarBitacoraTecnico,
    eliminarBitacoraTecnico,
    obtenerOpcionesRelacionBitacora,
} from "../controllers/bitacora-tecnico.controller.js";
import { auth } from "../middlewares/auth.js";

const router = Router();

router.get("/opciones-relacion", auth(true), obtenerOpcionesRelacionBitacora);

router.get("/", auth(true), obtenerBitacorasTecnico);
router.get("/:id", auth(true), obtenerBitacoraTecnicoPorId);
router.post("/", auth(true), crearBitacoraTecnico);
router.put("/:id", auth(true), actualizarBitacoraTecnico);
router.delete("/:id", auth(true), eliminarBitacoraTecnico);

export default router;