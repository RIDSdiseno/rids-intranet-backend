// src/routes/tecnicos.routes.ts
import express from "express";
import { listTecnicos, updateTecnico, deleteTecnico, createTecnico } from "../controllers/tecnicos.controller.js";
import { auth } from "../middlewares/auth.js";

const router = express.Router();

router.get("/", listTecnicos);
router.put("/:id", auth(), updateTecnico);
router.delete("/:id", auth(), deleteTecnico);
router.post("/", auth(), createTecnico);

export default router;
