import { Router } from "express";
import { generarRecomendacionesOperativasIA } from "../../controllers/ia-intranet-controller/ia-recomendaciones.controller.js";
const iaRecomendacionesRouter = Router();
iaRecomendacionesRouter.get("/recomendaciones-operativas/:empresaId/:year/:month", generarRecomendacionesOperativasIA);
export default iaRecomendacionesRouter;
//# sourceMappingURL=ia-recomendaciones.routes.js.map