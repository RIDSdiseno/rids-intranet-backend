import jwt from "jsonwebtoken";
import { asyncLocalStorage } from "../lib/request-context.js";
export function auth(required = true) {
    return (req, res, next) => {
        const header = req.headers.authorization;
        if (!header || !header.startsWith("Bearer ")) {
            if (!required)
                return next();
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
                email: payload.email ?? null, // ✅ CLAVE
            };
            // 🔥 Guardar usuario en contexto global para auditoría
            const store = asyncLocalStorage.getStore();
            if (store) {
                store.userId = Number(payload.sub);
            }
            return next();
        }
        catch {
            if (!required)
                return next();
            res.status(401).json({ error: "Invalid token" });
            return;
        }
    };
}
//# sourceMappingURL=auth.js.map