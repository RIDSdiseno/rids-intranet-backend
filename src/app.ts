import "dotenv/config";
import express, { type Request, type Response, type NextFunction } from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import cookieParser from "cookie-parser";
import { api } from "./routes.js";

/* ========= Helpers ========= */
function normalizeOrigin(origin: string): string {
  return origin.trim().replace(/\/+$/, ""); // quita espacios y "/" al final
}

function normalizeOriginList(raw?: string): string[] {
  if (!raw || raw.trim() === "") {
    return ["http://localhost:5173"];
  }
  return raw
    .split(",")
    .map(normalizeOrigin)
    .filter(Boolean);
}

function makeCorsOriginValidator(allowed: string[]): cors.CorsOptions["origin"] {
  const allowedNormalized = allowed.map(normalizeOrigin);
  console.log("[CORS] allowedOrigins =", allowedNormalized);

  return (origin, cb) => {
    // Permite herramientas/healthchecks sin header Origin
    if (!origin) return cb(null, true);

    const norm = normalizeOrigin(origin);
    if (allowedNormalized.includes(norm)) {
      return cb(null, true);
    }

    console.warn("[CORS] Not allowed:", origin, "->", norm);
    cb(new Error(`Not allowed by CORS: ${origin}`));
  };
}


const allowedOrigins = normalizeOriginList(process.env.CORS_ORIGIN);

const app = express();

/* ========= Base ========= */
// si hay proxy (Railway/Render/etc.)
app.set("trust proxy", 1);

// BigInt -> string en JSON (sin "any")
app.set("json replacer", (_key: string, value: unknown) =>
  typeof value === "bigint" ? value.toString() : value
);

/* ========= Seguridad / Parsers ========= */
app.use(
  helmet({
    crossOriginResourcePolicy: { policy: "cross-origin" },
    crossOriginOpenerPolicy: { policy: "same-origin-allow-popups" },
    crossOriginEmbedderPolicy: false, // evita bloqueos con recursos externos
    contentSecurityPolicy: false,     // si quieres CSP, la definimos luego
  })
);

app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

/* ========= CORS ========= */
const corsOptions: cors.CorsOptions = {
  origin: makeCorsOriginValidator(allowedOrigins),
  credentials: true,
  methods: ["GET","HEAD","PUT","PATCH","POST","DELETE","OPTIONS"],
  // sin allowedHeaders
  maxAge: 600,
};

app.use(cors(corsOptions));
app.options("*", cors(corsOptions));

app.use(cors(corsOptions));

// Preflight global con respuesta 204 (más limpio que el 200 con body)
// Delega el preflight al mismo corsOptions (no hagas headers a mano)
app.options("*", cors(corsOptions));

/* ========= Logs ========= */
app.use(morgan(process.env.NODE_ENV === "production" ? "combined" : "dev"));

/* ========= Healthcheck ========= */
app.get("/health", (_req, res) => res.status(200).send("ok"));

/* ========= Rutas ========= */
// Asegúrate que dentro de routes.js tengas algo como:
// router.post("/auth/login", ...)
// router.use("/tickets", ...), etc.
app.use("/api", api);

/* ========= 404 & Error handler ========= */
app.use((_req, res) => {
  res.status(404).json({ ok: false, error: "Not Found" });
});

app.use((
  err: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction
) => {
  const code = (err as { status?: number })?.status ?? 500;
  const msg = (err as { message?: string })?.message ?? "Internal Server Error";
  if (process.env.NODE_ENV !== "production") {
    // eslint-disable-next-line no-console
    console.error("[API ERROR]", err);
  }
  res.status(code).json({ ok: false, error: msg });
});

export default app;
