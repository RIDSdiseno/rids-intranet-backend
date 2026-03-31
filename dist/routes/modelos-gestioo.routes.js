import { Router } from "express";
import { createModelo, getModelos, getModeloById, updateModelo, deleteModelo, } from "../controllers/modelos-gestioo.controller.js";
const modelosGestiooRouter = Router();
modelosGestiooRouter.post("/", createModelo);
modelosGestiooRouter.get("/", getModelos);
modelosGestiooRouter.get("/:id", getModeloById);
modelosGestiooRouter.put("/:id", updateModelo);
modelosGestiooRouter.delete("/:id", deleteModelo);
export default modelosGestiooRouter;
//# sourceMappingURL=modelos-gestioo.routes.js.map