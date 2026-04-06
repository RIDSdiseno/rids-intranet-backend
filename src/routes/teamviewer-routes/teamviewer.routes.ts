// Rutas para manejo de TeamViewer, con endpoint para sincronización de datos, delegando la lógica al controlador correspondiente. Todas las rutas están protegidas por autenticación.
import { Router } from "express";
import { syncTeamViewer } from "../../controllers/controllers-teamviewer/teamviewer.controller.js";

const router = Router();

router.post("/sync", syncTeamViewer);

export default router;