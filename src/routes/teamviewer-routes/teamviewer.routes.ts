import { Router } from "express";
import { syncTeamViewer } from "../../controllers/controllers-teamviewer/teamviewer.controller.js";

const router = Router();

router.post("/sync", syncTeamViewer);

export default router;