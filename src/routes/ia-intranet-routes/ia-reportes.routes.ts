import { Router } from "express";
import { generarInformeMensualIA } from "../../controllers/ia-intranet-controller/ia-reportes.controller.js";

const iaReportesRouter = Router();

iaReportesRouter.get(
  "/informe-mensual/:empresaId/:year/:month",
  generarInformeMensualIA
);

export default iaReportesRouter;