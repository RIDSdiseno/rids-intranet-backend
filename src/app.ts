import "dotenv/config";
import express from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import cookieParser from "cookie-parser";

// Mantén tu convención de ".js"
import { api } from "./routes.js";

const app = express();

/* ========= Helpers ========= */
function parseCorsOrigin(env?: string): cors.CorsOptions["origin"] {
  if (!env || env === "true") return true;               // permite todo
  if (env === "false") return false;                     // bloquea todo
  // soporta lista separada por coma
  const list = env.split(",").map(s => s.trim()).filter(Boolean);
  return list.length ? list : env;                        // array o string único
}

/* ========= Middlewares base ========= */
// si usas proxy/reverse-proxy (nginx, vercel, render, railway...)
app.set("trust proxy", 1);

// server.ts (o donde creas el app)
app.set("json replacer", (_key: string, value: any) =>
  typeof value === "bigint" ? value.toString() : value
);


// Helmet (desactiva políticas estrictas que rompen front si no las necesitas)
app.use(
  helmet({
    crossOriginResourcePolicy: { policy: "cross-origin" },
    contentSecurityPolicy: false, // si más adelante quieres CSP, la definimos explícita
  })
);

// Body parsers (JSON + x-www-form-urlencoded para webhooks si los usas a futuro)
app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true }));

app.use(cookieParser());

// CORS: soporta orígenes múltiples vía env CORS_ORIGIN="https://a.com,https://b.com"
app.use(
  cors({
    origin: parseCorsOrigin(process.env.CORS_ORIGIN),
    credentials: true,
  })
);

// Logs
app.use(morgan(process.env.NODE_ENV === "production" ? "combined" : "dev"));

/* ========= Healthcheck ========= */
app.get("/health", (_req, res) => res.status(200).send("ok"));
app.options("*", cors()); // preflight global

/* ========= Rutas ========= */
// Todo tu API bajo /api (ya incluye /fd y /tickets dentro de routes.js)
app.use("/api", api);

/* ========= 404 & Error handler ========= */
app.use((_req, res) => {
  res.status(404).json({ ok: false, error: "Not Found" });
});
app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true })); // ⬅️ añade esto


app.use(
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  (err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    const code = err?.status || 500;
    const msg = err?.message || "Internal Server Error";
    if (process.env.NODE_ENV !== "production") {
      console.error("[API ERROR]", err);
    }
    res.status(code).json({ ok: false, error: msg });
  }
);

export default app;
