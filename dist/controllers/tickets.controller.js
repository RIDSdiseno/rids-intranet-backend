import { prisma } from "../lib/prisma.js";
export async function listTickets(req, res) {
    try {
        const all = req.query.all === "true";
        const page = Math.max(1, Number(req.query.page ?? 1));
        const pageSize = Math.min(500, Math.max(1, Number(req.query.pageSize ?? 200)));
        const search = req.query.search?.trim();
        const statusParam = req.query.status;
        const year = req.query.year ? Number(req.query.year) : undefined;
        const month = req.query.month ? Number(req.query.month) : undefined;
        const empresa = req.query.empresa?.trim();
        const where = {};
        if (typeof statusParam !== "undefined") {
            const s = Number(statusParam);
            if (!Number.isNaN(s))
                where.status = s;
        }
        if (year && year >= 1970 && year <= 2100) {
            const start = new Date(Date.UTC(year, month ? month - 1 : 0, 1));
            const end = month && month >= 1 && month <= 12
                ? new Date(Date.UTC(year, month, 1))
                : new Date(Date.UTC(year + 1, 0, 1));
            where.createdAt = { gte: start, lt: end };
        }
        // ⚠️ Fix: search y empresa sobre ticketOrg deben coexistir
        if (empresa && empresa.length > 0) {
            where.ticketOrg = {
                name: { contains: empresa, mode: "insensitive" },
            };
        }
        if (search && search.length > 0) {
            where.OR = [
                { subject: { contains: search, mode: "insensitive" } },
                { requesterEmail: { contains: search, mode: "insensitive" } },
                { ticketRequester: { email: { contains: search, mode: "insensitive" } } },
                // No incluir ticketOrg aquí si ya está en where.ticketOrg arriba
            ];
        }
        const skip = all ? undefined : (page - 1) * pageSize;
        const take = all ? undefined : pageSize;
        const [total, rows] = await Promise.all([
            prisma.freshdeskTicket.count({ where }),
            prisma.freshdeskTicket.findMany({
                where,
                orderBy: { createdAt: "desc" },
                ...(skip !== undefined ? { skip } : {}),
                ...(take !== undefined ? { take } : {}),
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
        res.json({
            total,
            page,
            pageSize,
            totalPages: take ? Math.ceil(total / pageSize) : 1,
            rows: data,
        });
    }
    catch (e) {
        console.error("[tickets.controller] listTickets error:", e?.message || e);
        res.status(500).json({ ok: false, error: e?.message ?? "error" });
    }
}
//# sourceMappingURL=tickets.controller.js.map