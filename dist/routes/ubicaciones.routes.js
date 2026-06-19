import { Router } from "express";
import { listarUltimasUbicacionesTecnicos } from "../controllers/ubicaciones.controller.js";
import { auth } from "../middlewares/auth.js";
import { canViewMapaTecnicos } from "../policies/canViewMapaTecnicos.js";
export const ubicacionesRouter = Router();
ubicacionesRouter.get("/tecnicos", auth(), (req, res, next) => {
    if (!canViewMapaTecnicos(req.user)) {
        res.status(403).json({
            message: "No tienes permisos para ver el mapa de técnicos",
        });
        return;
    }
    Promise.resolve(listarUltimasUbicacionesTecnicos(req, res)).catch(next);
});
export default ubicacionesRouter;
//# sourceMappingURL=ubicaciones.routes.js.map