// src/routes/tickets.ts
import { Router } from "express";
import { prisma } from "../lib/prisma.js";
export const ticketsRouter = Router();
/**
 * GET /api/tickets?page=1&pageSize=20&search=texto
 * Responde: ticket_id, solicitante, empresa, fecha, hora
 */
ticketsRouter.get("/", async (req, res) => {
    const page = Math.max(1, Number(req.query.page ?? 1));
    const pageSize = Math.min(100, Math.max(1, Number(req.query.pageSize ?? 20)));
    const search = req.query.search?.trim();
    const where = { status: 5 }; // solo cerrados
    if (search) {
        where.OR = [
            { subject: { contains: search, mode: "insensitive" } },
            { requesterEmail: { contains: search, mode: "insensitive" } },
        ];
    }
    const [total, rows] = await Promise.all([
        prisma.freshdeskTicket.count({ where }),
        prisma.freshdeskTicket.findMany({
            where,
            orderBy: { updatedAt: "desc" },
            skip: (page - 1) * pageSize,
            take: pageSize,
            select: {
                id: true,
                createdAt: true,
                ticketRequester: { select: { name: true } },
                ticketOrg: { select: { name: true } },
            },
        }),
    ]);
    const data = rows.map((r) => ({
        ticket_id: r.id.toString(), // evitar BigInt en JSON
        solicitante: r.ticketRequester?.name ?? null, // nombre del solicitante (tabla nueva)
        empresa: r.ticketOrg?.name ?? null, // nombre lógico de org (TicketOrg)
        fecha: r.createdAt.toISOString().slice(0, 10),
        hora: r.createdAt.toISOString().slice(11, 19),
    }));
    res.json({ page, pageSize, total, rows: data });
});
//# sourceMappingURL=tickets.js.map