import "dotenv/config";
import express, { type Request, type Response, type NextFunction } from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import cookieParser from "cookie-parser";
import { api } from "./routes.js";
import { prisma } from "./lib/prisma.js";

import { UPLOADS_DIR } from "./config/paths.js";
import { asyncLocalStorage } from "./lib/request-context.js";

import { startTeamViewerCron } from "./jobs/teamviewer.cron.js";

/* ========= Helpers ========= */
function normalizeOrigin(origin: string): string {
  return origin
    .trim()
    .replace(/^['"]|['"]$/g, "")
    .replace(/\/+$/, "");
}

function normalizeOriginList(raw?: string): string[] {
  if (!raw || raw.trim() === "") {
    console.warn("[CORS] CORS_ORIGIN no definido");
    return [];
  }

  return raw
    .split(",")
    .map(normalizeOrigin)
    .filter(Boolean);
}

function makeCorsOriginValidator(allowed: string[]): cors.CorsOptions["origin"] {
  const allowedNormalized = allowed.map(normalizeOrigin);

  console.log("[ENV] CORS_ORIGIN raw =", process.env.CORS_ORIGIN);
  console.log("[CORS] allowedOrigins =", allowedNormalized);

  return (origin, cb) => {
    console.log("[CORS] incoming origin =", origin);

    // Permite requests sin Origin, como healthchecks o herramientas de servidor
    if (!origin) {
      return cb(null, true);
    }

    const norm = normalizeOrigin(origin);
    console.log("[CORS] normalized incoming =", norm);

    if (allowedNormalized.includes(norm)) {
      console.log("[CORS] allowed");
      return cb(null, true);
    }

    console.warn("[CORS] blocked:", origin, "->", norm);
    return cb(null, false);
  };
}

const allowedOrigins = normalizeOriginList(process.env.CORS_ORIGIN);

const app = express();

app.set("prisma", prisma);

/* ========= Base ========= */
app.set("trust proxy", 1);

app.set("json replacer", (_key: string, value: unknown) =>
  typeof value === "bigint" ? value.toString() : value
);

/* ========= Seguridad / Parsers ========= */
app.use(
  helmet({
    crossOriginResourcePolicy: { policy: "cross-origin" },
    crossOriginOpenerPolicy: { policy: "same-origin-allow-popups" },
    crossOriginEmbedderPolicy: false,
    contentSecurityPolicy: false,
  })
);

app.use(express.json({ limit: "20mb" }));
app.use(express.urlencoded({ extended: true, limit: "20mb" }));
app.use(cookieParser());

/* ========= CORS ========= */
const corsOptions: cors.CorsOptions = {
  origin: makeCorsOriginValidator(allowedOrigins),
  credentials: true,
  methods: ["GET", "HEAD", "PUT", "PATCH", "POST", "DELETE", "OPTIONS"],
  maxAge: 600,
};

app.use(cors(corsOptions));

/* ========= Logs ========= */
app.use(morgan(process.env.NODE_ENV === "production" ? "combined" : "dev"));

/* ========= Healthcheck ========= */
app.get("/health", (_req, res) => res.status(200).send("ok"));

/* ========= Archivos estáticos (uploads) ========= */
app.use(
  "/uploads",
  express.static(UPLOADS_DIR, {
    maxAge: "7d",
    setHeaders: (res) => {
      res.setHeader("Cross-Origin-Resource-Policy", "cross-origin");
    },
  })
);

/* ========= Rutas ========= */
app.use("/api", api);

/* ========= 404 ========= */
app.use((_req, res) => {
  res.status(404).json({ ok: false, error: "Not Found" });
});

/* ========= Error handler ========= */
app.use((
  err: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction
) => {
  const code = (err as { status?: number })?.status ?? 500;
  const msg = (err as { message?: string })?.message ?? "Internal Server Error";

  console.error("[API ERROR]", err);

  res.status(code).json({
    ok: false,
    error: msg,
  });
});

export default app;