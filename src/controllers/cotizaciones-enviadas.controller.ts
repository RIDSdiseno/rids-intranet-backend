import type { Request, Response } from "express";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DATA_PATH = path.resolve(__dirname, "../../data/cotizaciones-enviadas.json");

function readAll(): any[] {
  try {
    if (!fs.existsSync(DATA_PATH)) return [];
    const raw = fs.readFileSync(DATA_PATH, "utf8");
    return JSON.parse(raw || "[]");
  } catch (e) {
    console.error("Error reading cotizaciones enviadas file:", e);
    return [];
  }
}

function writeAll(rows: any[]) {
  try {
    const dir = path.dirname(DATA_PATH);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(DATA_PATH, JSON.stringify(rows, null, 2), "utf8");
  } catch (e) {
    console.error("Error writing cotizaciones enviadas file:", e);
  }
}

export async function listCotizacionesEnviadas(_req: Request, res: Response) {
  const rows = readAll();
  return res.json(rows);
}

export async function createCotizacionEnvio(req: Request, res: Response) {
  try {
    // Log temporal para depuración: ver si la petición llega y qué trae
    console.log('[cotizaciones-enviadas] incoming request:', {
      url: req.url,
      method: req.method,
      auth: req.headers.authorization ? 'present' : 'missing',
      bodyPreview: JSON.stringify(req.body).slice(0, 1000),
    });

    const { cotizacionId, to, subject, jobId, meta, sentBy } = req.body;

    const rows = readAll();
    const entry = {
      id: (rows.length ? Math.max(...rows.map((r: any) => Number(r.id) || 0)) + 1 : 1),
      cotizacionId: cotizacionId ?? null,
      to: to ?? null,
      subject: subject ?? null,
      sentBy: sentBy ?? null,
      jobId: jobId ?? null,
      meta: meta ?? null,
      sentAt: new Date().toISOString(),
    };

    rows.unshift(entry);
    writeAll(rows);

    return res.status(201).json(entry);
  } catch (error: any) {
    console.error("createCotizacionEnvio error:", error);
    return res.status(500).json({ error: error?.message ?? String(error) });
  }
}

export async function deleteCotizacionEnvio(req: Request, res: Response) {
  try {
    const idParam = req.params.id;
    if (!idParam) return res.status(400).json({ error: 'Missing id' });
    const id = Number(idParam);
    const rows = readAll();
    const idx = rows.findIndex((r: any) => Number(r.id) === id || Number(r.cotizacionId) === id);
    if (idx === -1) return res.status(404).json({ error: 'Not found' });
    rows.splice(idx, 1);
    writeAll(rows);
    return res.status(200).json({ ok: true });
  } catch (e) {
    console.error('Error deleting cotizacion enviada:', e);
    return res.status(500).json({ error: String(e) });
  }
}
