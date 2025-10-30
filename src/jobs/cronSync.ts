// src/cron/syncGoogleUsers.cron.ts
import cron from "node-cron";
import { spawn } from "child_process";
import path from "path";
import fs from "fs";

/* ========= __dirname seguro (CJS/ESM) ========= */
let __dirnameSafe = "";
try {
  // @ts-ignore CJS
  __dirnameSafe = typeof __dirname !== "undefined" ? __dirname : "";
} catch {}
if (!__dirnameSafe) {
  try {
    // ESM
    const { fileURLToPath } = await import("url");
    const __filename = fileURLToPath(import.meta.url);
    __dirnameSafe = path.dirname(__filename);
  } catch {
    __dirnameSafe = process.cwd(); // último recurso
  }
}

/* ========= Helpers ========= */
function fileExists(p: string) {
  try { fs.accessSync(p, fs.constants.R_OK); return true; } catch { return false; }
}
function ls(dir: string) {
  try { return fs.readdirSync(dir).join(", "); } catch { return "(no accesible)"; }
}
function nowISO() { return new Date().toISOString(); }
function truncate(s: string, n = 4000) { return s.length > n ? s.slice(0, n) + "…[truncated]" : s; }

/* ========= Config ========= */
const TZ = process.env.TZ || "America/Santiago";
const EXP = process.env.CRON_EXPRESSION || "*/5 * * * *";
const ALLOW_TS_FALLBACK = (process.env.CRON_ALLOW_TS_FALLBACK ?? "true").toLowerCase() === "true";
const CRON_SCRIPT_PATH = process.env.CRON_SCRIPT_PATH || "";

/* ========= Resolver ruta del script =========
   Orden de resolución:
   0) ENV CRON_SCRIPT_PATH (si existe)
   1) dist/scripts/syncGoogleUsers.js relativo al archivo compilado (dist/cron/..)
   2) dist/scripts desde el cwd
   3) apps/backend/dist/scripts (monorepo)
   4) src/scripts/syncGoogleUsers.ts (fallback dev con runner TSX)
*/
const candidatesJs = [
  path.resolve(__dirnameSafe, "..", "scripts", "syncGoogleUsers.js"),
  path.resolve(process.cwd(), "dist", "scripts", "syncGoogleUsers.js"),
  path.resolve(process.cwd(), "apps", "backend", "dist", "scripts", "syncGoogleUsers.js"),
];
const candidatesTs = [
  path.resolve(__dirnameSafe, "..", "..", "src", "scripts", "syncGoogleUsers.ts"),
  path.resolve(process.cwd(), "src", "scripts", "syncGoogleUsers.ts"),
  path.resolve(process.cwd(), "apps", "backend", "src", "scripts", "syncGoogleUsers.ts"),
];

let scriptPath = "";
let runWithTsx = false;

if (CRON_SCRIPT_PATH && fileExists(CRON_SCRIPT_PATH)) {
  scriptPath = CRON_SCRIPT_PATH;
} else {
  scriptPath = candidatesJs.find(fileExists) || "";
  if (!scriptPath && ALLOW_TS_FALLBACK) {
    const tsCandidate = candidatesTs.find(fileExists);
    if (tsCandidate) {
      scriptPath = tsCandidate;
      runWithTsx = true;
    }
  }
}

/* ========= Logs diagnósticos si no hay ruta ========= */
if (!scriptPath) {
  console.error("[cron] No se encontró el script JS ni TS. Candidatos probados:");
  for (const c of [CRON_SCRIPT_PATH, ...candidatesJs, ...candidatesTs]) {
    if (c) console.error(" -", c);
  }
  console.error("Listados rápidos:");
  console.error(" dist/scripts (relativo a __dirname):", ls(path.resolve(__dirnameSafe, "..", "scripts")));
  console.error(" dist/scripts (cwd):", ls(path.resolve(process.cwd(), "dist", "scripts")));
  console.error(" apps/backend/dist/scripts:", ls(path.resolve(process.cwd(), "apps", "backend", "dist", "scripts")));
}

/* ========= Estado ========= */
type CronStatus = {
  job: "syncGoogleUsers";
  valid: boolean;
  expression: string;
  timezone: string;
  running: boolean;
  lastStart?: string;
  lastEnd?: string;
  lastExitCode?: number | null;
  lastError?: string | null;
  runs: number;
  lastDurationMs?: number;
  lastStdout?: string;
  lastStderr?: string;
};

export const syncGoogleUsersStatus: CronStatus = {
  job: "syncGoogleUsers",
  valid: cron.validate(EXP),
  expression: EXP,
  timezone: TZ,
  running: false,
  runs: 0,
  lastExitCode: null,
  lastError: null,
};

/* ========= Programación ========= */
if (!syncGoogleUsersStatus.valid) {
  console.error(`[cron] Expresión inválida: "${EXP}"`);
} else if (!scriptPath) {
  console.error("[cron] No se encontró ningún script válido (.js o .ts). Revisa el log anterior.");
} else {
  cron.schedule(EXP, () => runOnce(), { timezone: TZ });
  console.log(`[cron] Programado "${EXP}" TZ=${TZ} → ${scriptPath} ${runWithTsx ? "(tsx)" : "(js)"}`);
}

if ((process.env.CRON_RUN_ON_BOOT || "false").toLowerCase() === "true" && scriptPath) {
  runOnce();
}

/* ========= Ejecución ========= */
let proc: ReturnType<typeof spawn> | null = null;

export function runOnce() {
  if (!scriptPath) {
    console.error("[cron] Script no resuelto. Aborta.");
    return;
  }
  if (syncGoogleUsersStatus.running) {
    console.warn("[cron] Ya hay una ejecución en curso; se omite (anti-solape).");
    return;
  }

  // Verifica runner TSX si vamos a ejecutar .ts
  let args: string[] = [];
  if (runWithTsx) {
    try {
      const tsxCli = require.resolve("tsx/dist/cli.js");
      args = [tsxCli, scriptPath];
    } catch {
      syncGoogleUsersStatus.lastError = "Fallback TS habilitado pero falta 'tsx'. Instala: pnpm -F apps/backend add -D tsx typescript @types/node";
      console.error("[cron] Fallback TS habilitado pero falta 'tsx'.");
      return;
    }
  } else {
    args = [scriptPath]; // ejecuta JS compilado
  }

  syncGoogleUsersStatus.running = true;
  syncGoogleUsersStatus.lastStart = nowISO();
  syncGoogleUsersStatus.lastError = null;
  syncGoogleUsersStatus.lastExitCode = null;
  const t0 = Date.now();

  console.log("[cron] ejecutando syncGoogleUsers…");

  proc = spawn(process.execPath, args, { stdio: ["ignore", "pipe", "pipe"] });

  let out = "";
  let err = "";
  proc.stdout?.on("data", (d) => { const s = String(d); out += s; process.stdout.write(s); });
  proc.stderr?.on("data", (d) => { const s = String(d); err += s; process.stderr.write(s); });

  proc.on("error", (e) => {
    syncGoogleUsersStatus.lastError = e?.message || String(e);
    console.error("[cron] spawn error:", e);
  });

  proc.on("close", (code) => {
    const dur = Date.now() - t0;
    syncGoogleUsersStatus.running = false;
    syncGoogleUsersStatus.lastEnd = nowISO();
    syncGoogleUsersStatus.lastExitCode = code ?? null;
    syncGoogleUsersStatus.lastDurationMs = dur;
    syncGoogleUsersStatus.runs += 1;
    syncGoogleUsersStatus.lastStdout = truncate(out);
    syncGoogleUsersStatus.lastStderr = truncate(err);

    console.log(`[cron] syncGoogleUsers terminó con código ${code} (${dur} ms)`);
  });
}
