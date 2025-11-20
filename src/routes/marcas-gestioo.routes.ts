import { Router } from "express";
import {
    createMarca,
    getMarcas,
    getMarcaById,
    updateMarca,
    deleteMarca,
} from "../controllers/marcas-gestioo.controller.js";

const marcasGestiooRouter = Router();

marcasGestiooRouter.post("/", createMarca);
marcasGestiooRouter.get("/", getMarcas);
marcasGestiooRouter.get("/:id", getMarcaById);
marcasGestiooRouter.put("/:id", updateMarca);
marcasGestiooRouter.delete("/:id", deleteMarca);

export default marcasGestiooRouter;
