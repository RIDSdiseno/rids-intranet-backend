// src/routes/manuales-tutoriales.routes.ts
import { Router } from "express";
import { listManualesTutoriales, getManualTutorialById, createManualTutorial, updateManualTutorial, deleteManualTutorial, uploadManualTutorialFile, uploadManualTutorialMiddleware, } from "../controllers/manuales-tutoriales.controller.js";
import { auth } from "../middlewares/auth.js";
import { onlyRole } from "../middlewares/roles.js";
const router = Router();
router.get("/", auth(), onlyRole("ADMIN", "ADMINISTRACION", "TECNICO", "CLIENTE"), listManualesTutoriales);
router.post("/upload", auth(), onlyRole("ADMIN", "ADMINISTRACION", "TECNICO"), uploadManualTutorialMiddleware.single("file"), uploadManualTutorialFile);
router.get("/:id", auth(), onlyRole("ADMIN", "ADMINISTRACION", "TECNICO", "CLIENTE"), getManualTutorialById);
router.post("/", auth(), onlyRole("ADMIN", "ADMINISTRACION", "TECNICO"), createManualTutorial);
router.put("/:id", auth(), onlyRole("ADMIN", "ADMINISTRACION", "TECNICO"), updateManualTutorial);
router.delete("/:id", auth(), onlyRole("ADMIN", "ADMINISTRACION"), deleteManualTutorial);
export default router;
//# sourceMappingURL=manuales-tutoriales.routes.js.map