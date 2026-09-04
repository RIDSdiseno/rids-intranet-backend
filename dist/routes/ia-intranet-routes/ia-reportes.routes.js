import { Router } from "express";
import { generarInformeOperativoIA } from "../../controllers/controllers-ia-intranet/ia-reportes.controller.js";
import { generarInformeWordIABeta } from "../../controllers/controllers-ia-intranet/ia-reportes-docx-beta.controller.js";
const iaReportesRouter = Router();
iaReportesRouter.get("/informe-operativo/:empresaId/:year/:month", generarInformeOperativoIA);
iaReportesRouter.get("/word-beta/:empresaId/:year/:month", generarInformeWordIABeta);
export default iaReportesRouter;
//# sourceMappingURL=ia-reportes.routes.js.map