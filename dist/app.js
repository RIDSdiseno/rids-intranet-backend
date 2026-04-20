import "dotenv/config";
import express, {} from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import cookieParser from "cookie-parser";
import { api } from "./routes.js";
import { prisma } from "./lib/prisma.js";
//import path from "path";
import { UPLOADS_DIR } from "./config/paths.js";
//import { asyncLocalStorage } from "./lib/request-context.js";
//import { startTeamViewerCron } from "./jobs/teamviewer.cron.js";
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
const app = express();
console.log("[ENV] CORS_ORIGIN raw =", process.env.CORS_ORIGIN);
app.set("prisma", prisma);
/* ========= Base ========= */
app.set("trust proxy", 1);
app.set("json replacer", (_key, value) => typeof value === "bigint" ? value.toString() : value);
/* ========= Seguridad ========= */
app.use(helmet({
    crossOriginResourcePolicy: { policy: "cross-origin" },
    crossOriginOpenerPolicy: { policy: "same-origin-allow-popups" },
    crossOriginEmbedderPolicy: false,
    contentSecurityPolicy: false,
}));
/* ========= CORS ========= */
const allowedOrigins = [
    "https://rids-intranet.netlify.app",
    "http://localhost:5173",
    "http://localhost:5174",
    "http://localhost:8100",
    "capacitor://localhost",
    "ionic://localhost",
    "https://localhost",
];
console.log("[CORS] allowedOrigins =", allowedOrigins);
const corsOptions = {
    origin: (origin, callback) => {
        console.log("[CORS] incoming origin =", origin);
        if (!origin) {
            return callback(null, true);
        }
        if (allowedOrigins.includes(origin)) {
            return callback(null, true);
        }
        console.warn("[CORS] blocked origin =", origin);
        return callback(null, false);
    },
    credentials: true,
    methods: ["GET", "HEAD", "PUT", "PATCH", "POST", "DELETE", "OPTIONS"],
    allowedHeaders: [
        "Content-Type",
        "Authorization",
        "X-Requested-With",
        "Cache-Control",
        "Pragma",
        "Expires",
    ],
    optionsSuccessStatus: 204,
};
app.use(cors(corsOptions));
app.options(/.*/, cors(corsOptions));
/* ========= Parsers ========= */
app.use(express.json({ limit: "60mb" }));
app.use(express.urlencoded({ extended: true, limit: "60mb" }));
app.use(cookieParser());
/* ========= Logs ========= */
app.use(morgan(process.env.NODE_ENV === "production" ? "combined" : "dev"));
/* ========= Healthcheck ========= */
app.get("/health", (_req, res) => res.status(200).send("ok"));
/* ========= Archivos estáticos (uploads) ========= */
app.use("/uploads", express.static(UPLOADS_DIR, {
    maxAge: "7d",
    setHeaders: (res) => {
        res.setHeader("Cross-Origin-Resource-Policy", "cross-origin");
    },
}));
/* ========= Rutas ========= */
app.use("/api", api);
/* ========= 404 ========= */
app.use((_req, res) => {
    res.status(404).json({ ok: false, error: "Not Found" });
});
/* ========= Error handler ========= */
app.use((err, _req, res, _next) => {
    console.error("[API ERROR]", err);
    if (err?.type === "entity.too.large") {
        return res.status(413).json({
            ok: false,
            error: "El archivo es demasiado grande para ser procesado.",
        });
    }
    const code = err?.status ?? 500;
    const msg = err?.message ?? "Internal Server Error";
    res.status(code).json({
        ok: false,
        error: msg,
    });
    {
        return;
    }
});
export default app;
//# sourceMappingURL=app.js.map