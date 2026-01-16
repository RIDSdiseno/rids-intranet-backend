import { prisma } from "../lib/prisma.js";

/** YYYY-MM -> [start, end) en UTC */
export function monthRange(ym: string) {
    const [y, m] = ym.split("-").map(Number);
    if (!y || !m) throw new Error("month inválido (usa YYYY-MM)");
    const start = new Date(Date.UTC(y, m - 1, 1, 0, 0, 0));
    const end = new Date(Date.UTC(m === 12 ? y + 1 : y, m === 12 ? 0 : m, 1, 0, 0, 0));
    return { start, end };
}

/** Traduce Empresa.nombre -> TicketOrg.id */
const ALIASES: Record<string, string> = {};
function normalizeOrgName(nombre: string) {
    const key = (nombre ?? "").trim();
    if (!key) return null;
    return (ALIASES[key] ?? key).trim().toUpperCase();
}

export async function buildReporteEmpresaData(
    empresaId: number,
    ym: string
) {
    const empresa = await prisma.empresa.findUnique({
        where: { id_empresa: empresaId },
        select: { id_empresa: true, nombre: true },
    });
    if (!empresa) throw new Error("Empresa no encontrada");

    const { start, end } = monthRange(ym);

    // Visitas
    const visitas = await prisma.visita.findMany({
        where: { empresaId, inicio: { gte: start, lt: end } },
        select: { inicio: true, fin: true },
    });

    const visitasCount = visitas.length;
    const duracionesMs = visitas
        .filter(v => v.fin)
        .map(v => new Date(v.fin!).getTime() - new Date(v.inicio!).getTime())
        .filter(ms => ms > 0);

    const totalMs = duracionesMs.reduce((a, b) => a + b, 0);
    const avgMs = duracionesMs.length ? Math.round(totalMs / duracionesMs.length) : 0;

    // Equipos
    const equiposCount = await prisma.equipo.count({
        where: { solicitante: { empresaId } },
    });

    // Tickets
    const orgName = normalizeOrgName(empresa.nombre);
    let ticketsTotal = 0;

    if (orgName) {
        const org = await prisma.ticketOrg.findUnique({ where: { name: orgName } });
        if (org) {
            const grouped = await prisma.freshdeskTicket.groupBy({
                by: ["type"],
                _count: { _all: true },
                where: {
                    ticketOrgId: org.id,
                    createdAt: { gte: start, lt: end },
                },
            });
            ticketsTotal = grouped.reduce((a, b) => a + b._count._all, 0);
        }
    }

    return {
        empresa,
        month: ym,
        visitas: { count: visitasCount, totalMs, avgMs },
        equipos: { count: equiposCount },
        tickets: { total: ticketsTotal },
    };
}
