// Rutas para manejo de modelos de gestión, con endpoints para CRUD completo (crear, leer, actualizar, eliminar) y delegando la lógica al controlador correspondiente
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