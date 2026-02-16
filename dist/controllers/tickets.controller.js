import { prisma } from "../lib/prisma.js";
export async function listTickets(req, res) {
    try {
        // Si envías ?all=true, ignoramos la paginación
        const all = req.query.all === "true";
        const search = req.query.search?.trim();
        const statusParam = req.query.status;
        const year = req.query.year ? Number(req.query.year) : undefined;
        const month = req.query.month ? Number(req.query.month) : undefined;
        const empresa = req.query.empresa?.trim(); // NUEVO: parámetro para filtrar por empresa
        const where = {};
        if (typeof statusParam !== "undefined") {
            const s = Number(statusParam);
            if (!Number.isNaN(s))
                where.status = s;
        }
        if (year && year >= 1970 && year <= 2100) {
            const start = new Date(Date.UTC(year, (month ? month - 1 : 0), 1));
            const end = month && month >= 1 && month <= 12
                ? new Date(Date.UTC(year, month, 1))
                : new Date(Date.UTC(year + 1, 0, 1));
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
        // NUEVO: Filtro por empresa
        if (empresa && empresa.length > 0) {
            where.ticketOrg = {
                name: {
                    contains: empresa,
                    mode: "insensitive"
                }
            };
        }
        // Si all=true, traemos todos los tickets sin paginar
        const rows = await prisma.freshdeskTicket.findMany({
            where,
            orderBy: { createdAt: "desc" },
            ...(all ? {} : { skip: 0, take: 3000 }),
            select: {
                id: true,
                subject: true,
                type: true,
                createdAt: true,
                requesterEmail: true,
                ticketRequester: { select: { email: true } },
                ticketOrg: { select: { name: true } },
            },
        });
        const data = rows.map((r) => ({
            ticket_id: r.id.toString(),
            solicitante_email: r.ticketRequester?.email ?? r.requesterEmail ?? null,
            empresa: r.ticketOrg?.name ?? null,
            subject: r.subject,
            type: r.type ?? null,
            fecha: r.createdAt.toISOString(),
        }));
        res.json({ total: data.length, rows: data });
    }
    catch (e) {
        console.error("[tickets.controller] listTickets error:", e?.message || e);
        res.status(500).json({ ok: false, error: e?.message ?? "error" });
    }
}
//# sourceMappingURL=tickets.controller.js.map