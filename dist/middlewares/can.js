// src/middlewares/can.ts
import { hasPermission } from "../service/permisos/permissions.service.js";
export function can(permiso) {
    return async (req, res, next) => {
        try {
            const user = req.user;
            if (!user) {
                res.status(401).json({
                    ok: false,
                    error: "No autenticado",
                });
                return;
            }
            const allowed = await hasPermission(user.rol, permiso);
            if (!allowed) {
                res.status(403).json({
                    ok: false,
                    error: "No tienes permisos para esta acción",
                });
                return;
            }
            next();
        }
        catch (error) {
            console.error("[can] error:", error);
            res.status(500).json({
                ok: false,
                error: "Error validando permisos",
            });
        }
    };
}
//# sourceMappingURL=can.js.map