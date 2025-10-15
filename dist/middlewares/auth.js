import jwt from "jsonwebtoken";
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
            req.user = payload;
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