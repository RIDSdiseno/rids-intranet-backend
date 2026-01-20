// routes/reportes.routes.ts
import { Router } from "express";
import { exportReportesForSharepoint } from "../controllers/reportes-export.controller.js";
const reportesExportRouter = Router();
reportesExportRouter.post("/export/sharepoint", exportReportesForSharepoint);
export default reportesExportRouter;
//# sourceMappingURL=reportes-export.routes.js.map