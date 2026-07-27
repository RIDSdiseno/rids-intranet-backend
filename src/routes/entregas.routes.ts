import { Router } from "express";
import {
  listarEntregasIntranet,
  listarFiltrosEntregas,
} from "../controllers/entregas.controller.js";
import { auth } from "../middlewares/auth.js";

// Módulo de comprobantes de entrega para la intranet. Visible para cualquier
// usuario autenticado (todos los roles), solo requiere sesión válida.
export const entregasRouter = Router();

entregasRouter.get("/", auth(), (req, res, next) => {
  Promise.resolve(listarEntregasIntranet(req, res)).catch(next);
});

entregasRouter.get("/filtros", auth(), (req, res, next) => {
  Promise.resolve(listarFiltrosEntregas(req, res)).catch(next);
});

export default entregasRouter;
