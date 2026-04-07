import { Router } from "express";
import {
    syncTeamViewer,
} from "../../controllers/controllers-teamviewer/teamviewer.controller.js";

import {
    syncTeamViewerHistorical,
    getTeamViewerTotalsByEmpresa,
    getTeamViewerMonthlyAverages,
    getTeamViewerMonthlyBreakdown
} from "../../controllers/controllers-teamviewer/teamviewer-data.controller.js";

const router = Router();

// Sync incremental normal
router.post("/sync", syncTeamViewer);

// Backfill histórico por rango
router.post("/sync/historical", syncTeamViewerHistorical);

// Totales históricos por empresa
router.get("/totals", getTeamViewerTotalsByEmpresa);

// Promedios mensuales por empresa
router.get("/monthly-averages", getTeamViewerMonthlyAverages);
router.get("/monthly-breakdown", getTeamViewerMonthlyBreakdown);

export default router;