import jwt from "jsonwebtoken";
import { asyncLocalStorage } from "../lib/request-context.js";
export function auth(required = true) {
    return (req, res, next) => {
        const header = req.headers.authorization;
        if (!header || !header.startsWith("Bearer ")) {
            if (!required) {
                return asyncLocalStorage.run({ userId: null }, async () => next());
            }
            res.status(401).json({ error: "Unauthorized" });
            return;
        }
        const token = header.slice(7);
        try {
            const payload = jwt.verify(token, process.env.JWT_SECRET);
            req.user = {
                id: Number(payload.sub),
                rol: payload.rol ?? "TECNICO",
                empresaId: payload.empresaId ?? null,
                email: payload.email ?? null,
            };
            // ✅ Contexto creado con userId real
            return asyncLocalStorage.run({ userId: Number(payload.sub) }, async () => {
                next();
            });
        }
        catch {
            if (!required) {
                return asyncLocalStorage.run({ userId: null }, () => next());
            }
            res.status(401).json({ error: "Invalid token" });
            return;
        }
    };
}
//# sourceMappingURL=auth.js.map