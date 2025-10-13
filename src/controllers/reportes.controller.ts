import type { Request, Response } from "express";
import { prisma } from "../lib/prisma.js";

/** Traduce Empresa.nombre -> TicketOrg.id sin tocar el schema. */
const ALIASES: Record<string, string> = {
  // "Asur": "ASUR",
  // "Pini": "PINI",
};
function normalizeOrgName(nombre: string) {
  const key = (nombre ?? "").trim();
  if (!key) return null;
  return (ALIASES[key] ?? key).trim().toUpperCase();
}

/** YYYY-MM -> [start, end) en UTC */
function monthRange(ym: string) {
  const [y, m] = ym.split("-").map(Number);
  if (!y || !m) throw new Error("month inválido (usa YYYY-MM)");
  const start = new Date(Date.UTC(y, m - 1, 1, 0, 0, 0));
  const end   = new Date(Date.UTC(m === 12 ? y + 1 : y, m === 12 ? 0 : m, 1, 0, 0, 0));
  return { start, end };
}

export async function getReporteEmpresa(req: Request, res: Response) {
  try {
    const empresaId = Number(req.params.empresaId);
    const ym = String(req.query.month || "").trim(); // "YYYY-MM"

    if (!Number.isInteger(empresaId) || empresaId <= 0) {
      return res.status(400).json({ error: "empresaId inválido" });
    }
    if (!/^\d{4}-\d{2}$/.test(ym)) {
      return res.status(400).json({ error: "month debe ser YYYY-MM" });
    }

    const empresa = await prisma.empresa.findUnique({
      where: { id_empresa: empresaId },
      select: { id_empresa: true, nombre: true },
    });
    if (!empresa) return res.status(404).json({ error: "Empresa no encontrada" });

    const { start, end } = monthRange(ym);

    // 1) Visitas del mes
    const visitas = await prisma.visita.findMany({
      where: { empresaId, inicio: { gte: start, lt: end } },
      select: { inicio: true, fin: true },
    });
    const visitasCount = visitas.length;
    const duracionesMs = visitas
      .filter(v => v.fin)
      .map(v => new Date(v.fin as Date).getTime() - new Date(v.inicio).getTime())
      .filter(ms => ms > 0);
    const totalMs = duracionesMs.reduce((a, b) => a + b, 0);
    const avgMs = duracionesMs.length ? Math.round(totalMs / duracionesMs.length) : 0;

    // 2) Equipos totales (por solicitantes de la empresa)
    const equiposCount = await prisma.equipo.count({
      where: { solicitante: { empresaId } },
    });

    // 3) Tickets del mes (usando TicketOrg)
    const orgName = normalizeOrgName(empresa.nombre);
    let ticketOrgId: number | null = null;
    let ticketsByType: { type: string; count: number }[] = [];
    let ticketsByStatus: { status: number; count: number }[] = [];
    let ticketsTotal = 0;

    if (orgName) {
      const org = await prisma.ticketOrg.findUnique({ where: { name: orgName } });
      ticketOrgId = org?.id ?? null;

      if (ticketOrgId) {
        const byType = await prisma.freshdeskTicket.groupBy({
          by: ["type"],
          _count: { _all: true },
          where: {
            ticketOrgId,
            createdAt: { gte: start, lt: end },
          },
        });
        ticketsByType = byType.map(g => ({ type: g.type ?? "Sin tipo", count: g._count._all }));
        ticketsTotal = ticketsByType.reduce((a, b) => a + b.count, 0);

        const byStatus = await prisma.freshdeskTicket.groupBy({
          by: ["status"],
          _count: { _all: true },
          where: {
            ticketOrgId,
            createdAt: { gte: start, lt: end },
          },
        });
        ticketsByStatus = byStatus.map(g => ({ status: g.status, count: g._count._all }));
      }
    }

    return res.json({
      empresa,
      month: ym,
      visitas: { count: visitasCount, totalMs, avgMs },
      equipos: { count: equiposCount },
      tickets: {
        total: ticketsTotal,
        byType: ticketsByType,
        byStatus: ticketsByStatus,
        ticketOrgId, // útil para debug
      },
    });
  } catch (err: any) {
    console.error("getReporteEmpresa error:", err);
    return res.status(500).json({ error: err?.message ?? "Error" });
  }
}
