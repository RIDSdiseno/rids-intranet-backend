// src/routes/mapa-agendas.routes.ts
import { Router } from "express";
import { listarAgendasMapa } from "../controllers/mapa-agendas.controller.js";
import { auth } from "../middlewares/auth.js";
export const mapaAgendasRouter = Router();
mapaAgendasRouter.get("/agendas", auth(), (req, res, next) => {
    Promise.resolve(listarAgendasMapa(req, res)).catch(next);
});
export default mapaAgendasRouter;
//# sourceMappingURL=mapa-agendas.routes.js.map