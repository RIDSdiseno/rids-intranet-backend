// src/routes/tecnicos.routes.ts
import express from "express";
import { listTecnicos } from "../controllers/tecnicos.controller.js";

const router = express.Router();

router.get("/", listTecnicos);

export default router;
