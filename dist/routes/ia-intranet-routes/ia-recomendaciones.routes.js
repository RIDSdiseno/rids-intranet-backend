// Rutas para manejo de recomendaciones operativas mediante IA, con endpoint para generación de recomendaciones por empresa, año y mes, delegando la lógica al controlador correspondiente. Todas las rutas están protegidas por autenticación.
import { Router } from "express";
import { generarRecomendacionesOperativasIA } from "../../controllers/ia-intranet-controller/ia-recomendaciones.controller.js";
const iaRecomendacionesRouter = Router();
iaRecomendacionesRouter.get("/recomendaciones-operativas/:empresaId/:year/:month", generarRecomendacionesOperativasIA);
export default iaRecomendacionesRouter;
//# sourceMappingURL=ia-recomendaciones.routes.js.map