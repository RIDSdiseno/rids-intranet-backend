// src/controllers/tickets.controller.ts
import type { Request, Response } from "express";
import { prisma } from "../lib/prisma.js";

export async function listTickets(req: Request, res: Response) {
  try {
    const page = Math.max(1, Number(req.query.page ?? 1));
    const pageSize = Math.min(1000, Math.max(1, Number(req.query.pageSize ?? 20)));
    const search = (req.query.search as string)?.trim();
    const statusParam = req.query.status;
    const year = req.query.year ? Number(req.query.year) : undefined;   // e.g. 2025
    const month = req.query.month ? Number(req.query.month) : undefined; // 1..12

    const where: any = {};

    if (typeof statusParam !== "undefined") {
      const s = Number(statusParam);
      if (!Number.isNaN(s)) where.status = s;
    }

    // rango por año/mes
    if (year && year >= 1970 && year <= 2100) {
      const start = new Date(Date.UTC(year, (month ? month - 1 : 0), 1, 0, 0, 0));
      const end =
        month && month >= 1 && month <= 12
          ? new Date(Date.UTC(year, month, 1, 0, 0, 0)) // primer día del mes siguiente
          : new Date(Date.UTC(year + 1, 0, 1, 0, 0, 0)); // primer día del siguiente año
      where.createdAt = { gte: start, lt: end };
    }

    if (search && search.length > 0) {
      where.OR = [
        { subject: { contains: search, mode: "insensitive" } },
        { requesterEmail: { contains: search, mode: "insensitive" } },
        { ticketRequester: { email: { contains: search, mode: "insensitive" } } },
        { ticketOrg: { name: { contains: search, mode: "insensitive" } } },
      ];
    }

    const [total, rows] = await Promise.all([
      prisma.freshdeskTicket.count({ where }),
      prisma.freshdeskTicket.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
        select: {
          id: true,
          subject: true,
          type: true,
          createdAt: true,
          requesterEmail: true,
          ticketRequester: { select: { email: true } },
          ticketOrg: { select: { name: true } },
        },
      }),
    ]);

    const data = rows.map((r) => ({
      ticket_id: r.id.toString(),
      solicitante_email: r.ticketRequester?.email ?? r.requesterEmail ?? null,
      empresa: r.ticketOrg?.name ?? null,
      subject: r.subject,
      type: r.type ?? null,
      fecha: r.createdAt.toISOString(),
    }));

    res.json({ page, pageSize, total, rows: data });
  } catch (e: any) {
    console.error("[tickets.controller] listTickets error:", e?.message || e);
    res.status(500).json({ ok: false, error: e?.message ?? "error" });
  }
}
