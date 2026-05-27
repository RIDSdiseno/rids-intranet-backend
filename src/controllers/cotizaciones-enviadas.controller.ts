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

    const { cotizacionId, to, subject, jobId, meta, sentBy: sentByBody, clienteNombre: clienteBody, creadoPor: creadoBody, fechaCreacion: fechaBody } = req.body;

    // Prefer explicit sentBy in body; otherwise, resolve authenticated user's nombre desde Prisma si es posible, o usar email
    const user = (req as any).user;
    let sentBy: string | null = sentByBody ?? null;
    if (!sentBy && user?.id) {
      try {
        const { prisma } = await import('../lib/prisma.js');
        const u = await prisma.usuario.findUnique({ where: { id: Number(user.id) } });
        if (u) sentBy = (u as any).nombre ?? (u as any).email ?? null;
      } catch (err) {
        console.warn('No se pudo resolver nombre de usuario para sentBy:', err);
        sentBy = user?.email ?? null;
      }
    }
    if (!sentBy) sentBy = user?.email ?? null;

    // Enriquecer con datos de la cotización si disponemos de cotizacionId
    let clienteNombre: string | null = null;
    let creadoPor: string | null = null;
    let fechaCreacion: string | null = null;

    if (cotizacionId) {
      try {
        const { prisma } = await import("../lib/prisma.js");
        const cot = await prisma.cotizacionGestioo.findUnique({
          where: { id: Number(cotizacionId) },
          include: { entidad: true, tecnico: true },
        });
        if (cot) {
          clienteNombre = cot.entidad?.nombre ?? null;
          creadoPor = cot.tecnico?.nombre ?? null;
          fechaCreacion = (cot as any).fecha ?? (cot as any).createdAt ?? null;
        }
      } catch (err) {
        console.warn('No se pudo enriquecer cotizacionId:', cotizacionId, err);
      }
    }

    // Si el body trae explícitamente los campos, úsalos (tienen prioridad)
    if (clienteBody) clienteNombre = clienteBody;
    if (creadoBody) creadoPor = creadoBody;
    if (fechaBody) fechaCreacion = fechaBody;

    const rows = readAll();
    const nowIso = new Date().toISOString();

    // Evitar duplicados: si ya existe un registro con mismo jobId+to+cotizacionId, actualizarlo
    const matchIndex = rows.findIndex((r: any) => r.jobId === jobId && r.to === (to ?? null) && (r.cotizacionId ?? null) === (cotizacionId ?? null));
    let entry: any;
    if (matchIndex >= 0) {
      rows[matchIndex] = {
        ...rows[matchIndex],
        cotizacionId: cotizacionId ?? rows[matchIndex].cotizacionId,
        subject: subject ?? rows[matchIndex].subject,
        sentBy: sentBy ?? rows[matchIndex].sentBy,
        meta: meta ?? rows[matchIndex].meta,
        clienteNombre: clienteNombre ?? rows[matchIndex].clienteNombre,
        creadoPor: creadoPor ?? rows[matchIndex].creadoPor,
        fechaCreacion: fechaCreacion ?? rows[matchIndex].fechaCreacion,
        sentAt: nowIso,
      };
      entry = rows[matchIndex];
    } else {
      entry = {
        id: (rows.length ? Math.max(...rows.map((r: any) => Number(r.id) || 0)) + 1 : 1),
        cotizacionId: cotizacionId ?? null,
        to: to ?? null,
        subject: subject ?? null,
        sentBy: sentBy ?? null,
        jobId: jobId ?? null,
        meta: meta ?? null,
        clienteNombre,
        creadoPor,
        fechaCreacion,
        sentAt: nowIso,
      };
      rows.unshift(entry);
    }
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
