import jwt from "jsonwebtoken";
import { randomUUID } from "crypto";
import { asyncLocalStorage, setRequestContext, clearRequestContext } from "../lib/request-context.js";
// Middleware de autenticación que verifica el token JWT y enriquece el request con la información del usuario
export function auth(required = true) {
    return (req, res, next) => {
        const header = req.headers.authorization;
        if (!header || !header.startsWith("Bearer ")) {
            if (!required) {
                const requestId = randomUUID();
                setRequestContext(requestId, null);
                asyncLocalStorage.run({ userId: null, requestId }, () => {
                    res.on("finish", () => clearRequestContext(requestId));
                    next();
                });
                return;
            }
            res.status(401).json({ error: "Unauthorized" });
            return;
        }
        const token = header.slice(7);
        // Verificamos el token JWT
        try {
            const payload = jwt.verify(token, process.env.JWT_SECRET);
            const userId = Number(payload.sub);
            const requestId = randomUUID();
            req.user = {
                id: userId,
                rol: payload.rol ?? "TECNICO",
                empresaId: payload.empresaId ?? null,
                email: payload.email ?? null,
            };
            setRequestContext(requestId, userId);
            asyncLocalStorage.run({ userId, requestId }, () => {
                res.on("finish", () => clearRequestContext(requestId));
                next();
            });
            return;
        }
        catch (err) {
            if (!required) {
                const requestId = randomUUID();
                setRequestContext(requestId, null);
                asyncLocalStorage.run({ userId: null, requestId }, () => {
                    res.on("finish", () => clearRequestContext(requestId));
                    next();
                });
                return;
            }
            if (err?.name === "TokenExpiredError") {
                res.status(401).json({ error: "TOKEN_EXPIRED" });
                return;
            }
            res.status(401).json({ error: "INVALID_TOKEN" });
            return;
        }
    };
}
export function onlyOwnEmpresa() {
    return (req, res, next) => {
        const user = req.user;
        // Solo aplica a CLIENTEs
        if (!user || user.rol !== "CLIENTE") {
            next();
            return;
        }
        // Si el cliente no tiene empresaId en su token, bloquear
        if (!user.empresaId) {
            res.status(403).json({ error: "Tu cuenta no está asociada a ninguna empresa" });
            return;
        }
        // Forzar el empresaId del token en la request para que los
        // controllers lo usen directamente
        req.query.empresaId = String(user.empresaId);
        // Si hay empresaId en params o body que no coincide, bloquear
        const paramId = req.params.empresaId;
        const bodyId = req.body?.empresaId;
        if (paramId && Number(paramId) !== user.empresaId) {
            res.status(403).json({ error: "No tienes acceso a los datos de esta empresa" });
            return;
        }
        if (bodyId && Number(bodyId) !== user.empresaId) {
            res.status(403).json({ error: "No tienes acceso a los datos de esta empresa" });
            return;
        }
        next();
    };
}
//# sourceMappingURL=auth.js.map