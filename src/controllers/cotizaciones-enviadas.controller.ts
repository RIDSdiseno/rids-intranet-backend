// src/controllers/cotizaciones-enviadas.controller.ts
import type { Request, Response } from "express";
import { prisma } from "../lib/prisma.js";

export async function listCotizacionesEnviadas(_req: Request, res: Response) {
  try {
    const rows = await prisma.cotizacionEnviada.findMany({
      orderBy: { sentAt: "desc" },
    });
    return res.json(rows);
  } catch (error: any) {
    console.error("listCotizacionesEnviadas error:", error);
    return res.status(500).json({ error: error?.message ?? String(error) });
  }
}

export async function createCotizacionEnvio(req: Request, res: Response) {
  try {
    const {
      cotizacionId,
      to,
      subject,
      jobId,
      meta,
      sentBy: sentByBody,
      clienteNombre: clienteBody,
      creadoPor: creadoBody,
      fechaCreacion: fechaBody,
    } = req.body;

    // Resolver nombre del remitente
    const user = (req as any).user;
    let sentBy: string | null = sentByBody ?? null;
    if (!sentBy && user?.id) {
      try {
        const u = await prisma.tecnico.findUnique({
          where: {
            id_tecnico: Number(user.id),
          },
          select: {
            nombre: true,
            email: true,
          },
        });
        if (u) sentBy = (u as any).nombre ?? (u as any).email ?? null;
      } catch {
        sentBy = user?.email ?? null;
      }
    }
    if (!sentBy) sentBy = user?.email ?? null;

    // Enriquecer con datos de la cotización si hay cotizacionId
    let clienteNombre: string | null = clienteBody ?? null;
    let creadoPor: string | null = creadoBody ?? null;
    let fechaCreacion: Date | null = fechaBody ? new Date(fechaBody) : null;

    if (cotizacionId && (!clienteNombre || !creadoPor)) {
      try {
        const cot = await prisma.cotizacionGestioo.findUnique({
          where: { id: Number(cotizacionId) },
          include: { entidad: true, tecnico: true },
        });
        if (cot) {
          if (!clienteNombre) clienteNombre = cot.entidad?.nombre ?? null;
          if (!creadoPor) creadoPor = cot.tecnico?.nombre ?? null;
          if (!fechaCreacion) {
            const f = (cot as any).fecha ?? (cot as any).createdAt ?? null;
            fechaCreacion = f ? new Date(f) : null;
          }
        }
      } catch (err) {
        console.warn("No se pudo enriquecer cotizacionId:", cotizacionId, err);
      }
    }

    // Upsert: si existe mismo jobId+to+cotizacionId, actualizar
    const cotId = cotizacionId ? Number(cotizacionId) : null;
    const existing = jobId
      ? await prisma.cotizacionEnviada.findFirst({
        where: { jobId, to: to ?? null, cotizacionId: cotId },
      })
      : null;

    let entry;
    if (existing) {
      entry = await prisma.cotizacionEnviada.update({
        where: { id: existing.id },
        data: {
          cotizacionId: cotId ?? existing.cotizacionId,
          subject: subject ?? existing.subject,
          sentBy: sentBy ?? existing.sentBy,
          meta: meta ?? existing.meta,
          clienteNombre: clienteNombre ?? existing.clienteNombre,
          creadoPor: creadoPor ?? existing.creadoPor,
          fechaCreacion: fechaCreacion ?? existing.fechaCreacion,
          sentAt: new Date(),
        },
      });
    } else {
      entry = await prisma.cotizacionEnviada.create({
        data: {
          cotizacionId: cotId,
          to: to ?? null,
          subject: subject ?? null,
          sentBy,
          jobId: jobId ?? null,
          meta: meta ?? undefined,
          clienteNombre,
          creadoPor,
          fechaCreacion,
        },
      });
    }

    return res.status(201).json(entry);
  } catch (error: any) {
    console.error("createCotizacionEnvio error:", error);
    return res.status(500).json({ error: error?.message ?? String(error) });
  }
}

export async function deleteCotizacionEnvio(req: Request, res: Response) {
  try {
    const id = Number(req.params.id);
    if (!id) return res.status(400).json({ error: "Missing id" });

    // Buscar por id directo o por cotizacionId
    const record = await prisma.cotizacionEnviada.findFirst({
      where: { OR: [{ id }, { cotizacionId: id }] },
    });
    if (!record) return res.status(404).json({ error: "Not found" });

    await prisma.cotizacionEnviada.delete({ where: { id: record.id } });
    return res.json({ ok: true });
  } catch (error: any) {
    console.error("deleteCotizacionEnvio error:", error);
    return res.status(500).json({ error: error?.message ?? String(error) });
  }
}
