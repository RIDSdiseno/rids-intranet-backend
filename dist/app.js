import "dotenv/config";
import express, {} from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import cookieParser from "cookie-parser";
import { api } from "./routes.js";
import { prisma } from "./lib/prisma.js";
import path from "path";
import { UPLOADS_DIR } from "./config/paths.js";
import { asyncLocalStorage } from "./lib/request-context.js";
import { startTeamViewerCron } from "./jobs/teamviewer.cron.js";
/* ========= Helpers ========= */
function normalizeOrigin(origin) {
    return origin.trim().replace(/\/+$/, ""); // quita espacios y "/" al final
}
function normalizeOriginList(raw) {
    if (!raw || raw.trim() === "") {
        return ["http://localhost:5173"];
    }
    return raw
        .split(",")
        .map(normalizeOrigin)
        .filter(Boolean);
}
function makeCorsOriginValidator(allowed) {
    const allowedNormalized = allowed.map(normalizeOrigin);
    return (origin, cb) => {
        if (!origin)
            return cb(null, true);
        const norm = normalizeOrigin(origin);
        const isAllowed = allowedNormalized.some(a => norm.startsWith(a));
        if (isAllowed) {
            return cb(null, true);
        }
        console.warn("[CORS] Not allowed:", origin);
        return cb(null, false);
    };
}
const allowedOrigins = normalizeOriginList(process.env.CORS_ORIGIN);
const app = express();
app.set("prisma", prisma);
/* ========= Base ========= */
// si hay proxy (Railway/Render/etc.)
app.set("trust proxy", 1);
// BigInt -> string en JSON (sin "any")
app.set("json replacer", (_key, value) => typeof value === "bigint" ? value.toString() : value);
/* ========= Seguridad / Parsers ========= */
app.use(helmet({
    crossOriginResourcePolicy: { policy: "cross-origin" },
    crossOriginOpenerPolicy: { policy: "same-origin-allow-popups" },
    crossOriginEmbedderPolicy: false, // evita bloqueos con recursos externos
    contentSecurityPolicy: false, // si quieres CSP, la definimos luego
}));
app.use(express.json({ limit: "20mb" }));
app.use(express.urlencoded({ extended: true, limit: "20mb" }));
app.use(cookieParser());
/* ========= CORS ========= */
const corsOptions = {
    origin: makeCorsOriginValidator(allowedOrigins),
    credentials: true,
    methods: ["GET", "HEAD", "PUT", "PATCH", "POST", "DELETE", "OPTIONS"],
    // sin allowedHeaders
    maxAge: 600,
};
app.use(cors(corsOptions));
// Preflight global con respuesta 204 (más limpio que el 200 con body)
// Delega el preflight al mismo corsOptions (no hagas headers a mano)
app.options("*", cors(corsOptions));
/* ========= Logs ========= */
app.use(morgan(process.env.NODE_ENV === "production" ? "combined" : "dev"));
/* ========= Healthcheck ========= */
app.get("/health", (_req, res) => res.status(200).send("ok"));
/* ========= Archivos estáticos (uploads) ========= */
// Sirve firmas, adjuntos, etc. desde /uploads
app.use("/uploads", express.static(UPLOADS_DIR, {
    maxAge: "7d",
    setHeaders: (res) => {
        res.setHeader("Cross-Origin-Resource-Policy", "cross-origin");
    },
}));
/* ========= Rutas ========= */
// Asegúrate que dentro de routes.js tengas algo como:
// router.post("/auth/login", ...)
// router.use("/tickets", ...), etc.
app.use("/api", api);
/* ========= 404 & Error handler ========= */
app.use((_req, res) => {
    res.status(404).json({ ok: false, error: "Not Found" });
});
// Manejo centralizado de errores (puedes expandirlo para manejar distintos tipos de errores)
app.use((err, _req, res, _next) => {
    const code = err?.status ?? 500;
    const msg = err?.message ?? "Internal Server Error";
    if (process.env.NODE_ENV !== "production") {
        // eslint-disable-next-line no-console
        console.error("[API ERROR]", err);
    }
    res.status(code).json({ ok: false, error: msg });
});
export default app;
//# sourceMappingURL=app.js.map