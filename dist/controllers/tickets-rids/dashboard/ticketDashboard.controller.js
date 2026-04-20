import { prisma } from "../../../lib/prisma.js";
function buildDateFilter(fromDate, toDate, startIdx = 1) {
    const params = [];
    let sql = "";
    let idx = startIdx;
    if (fromDate) {
        sql += ` AND t."createdAt" >= ($${idx++}::timestamptz AT TIME ZONE 'UTC')`;
        params.push(fromDate);
    }
    if (toDate) {
        sql += ` AND t."createdAt" < ($${idx++}::timestamptz AT TIME ZONE 'UTC')`;
        params.push(toDate);
    }
    return { sql, params, nextIdx: idx };
}
// ── GET /api/helpdesk/tickets-dashboard/monthly ──────────────────────────────
export async function getTicketsDashboardMonthly(req, res) {
    try {
        const fromDate = typeof req.query.fromDate === "string" ? req.query.fromDate : undefined;
        const toDate = typeof req.query.toDate === "string" ? req.query.toDate : undefined;
        const empresaId = typeof req.query.empresaId === "string" ? req.query.empresaId : undefined;
        const { sql: dateFilter, params } = buildDateFilter(fromDate, toDate, empresaId ? 2 : 1);
        const empresaFilter = empresaId ? `AND t."empresaId" = $1` : "";
        const allParams = empresaId ? [Number(empresaId), ...params] : params;
        const rows = await prisma.$queryRawUnsafe(`
            SELECT
                e.id_empresa,
                e.nombre                                                        AS empresa,
                TO_CHAR(DATE_TRUNC('month', t."createdAt"), 'YYYY-MM')          AS mes,
                COUNT(*)                                                        AS total_tickets,
                COUNT(*) FILTER (WHERE t."closedAt" IS NOT NULL)               AS tickets_cerrados,

                -- Horas cap 8h (solo tickets cerrados)
                ROUND(SUM(
                    LEAST(
                        EXTRACT(EPOCH FROM (t."closedAt" - t."createdAt")) / 3600,
                        8.0
                    )
                ) FILTER (WHERE t."closedAt" IS NOT NULL)::numeric, 1)         AS horas_cap8h,

                -- % resueltos en menos de 8h
                ROUND(
                    COUNT(*) FILTER (
                        WHERE t."closedAt" IS NOT NULL
                        AND EXTRACT(EPOCH FROM (t."closedAt" - t."createdAt")) / 3600 <= 8
                    ) * 100.0 / NULLIF(COUNT(*) FILTER (WHERE t."closedAt" IS NOT NULL), 0)
                , 1)                                                            AS pct_resueltos_8h,

                -- Tickets complejos >8h
                COUNT(*) FILTER (
                    WHERE t."closedAt" IS NOT NULL
                    AND EXTRACT(EPOCH FROM (t."closedAt" - t."createdAt")) / 3600 > 8
                )                                                               AS tickets_complejos,

                -- Mediana de resolución en minutos (solo cerrados <=8h)
                ROUND(PERCENTILE_CONT(0.5) WITHIN GROUP (
                    ORDER BY EXTRACT(EPOCH FROM (t."closedAt" - t."createdAt")) / 60
                ) FILTER (
                    WHERE t."closedAt" IS NOT NULL
                    AND EXTRACT(EPOCH FROM (t."closedAt" - t."createdAt")) / 3600 <= 8
                )::numeric, 0)                                                  AS mediana_minutos

            FROM "Ticket" t
            JOIN "Empresa" e ON e.id_empresa = t."empresaId"
            WHERE t."createdAt" IS NOT NULL
            ${empresaFilter}
            ${dateFilter}
            GROUP BY e.id_empresa, e.nombre, DATE_TRUNC('month', t."createdAt")
            ORDER BY e.nombre ASC, DATE_TRUNC('month', t."createdAt") ASC
        `, ...allParams);
        const items = rows.map((r) => ({
            id_empresa: Number(r.id_empresa),
            empresa: r.empresa,
            mes: r.mes,
            total_tickets: Number(r.total_tickets),
            tickets_cerrados: Number(r.tickets_cerrados),
            horas_cap8h: Number(r.horas_cap8h ?? 0),
            pct_resueltos_8h: Number(r.pct_resueltos_8h ?? 0),
            tickets_complejos: Number(r.tickets_complejos),
            mediana_minutos: Number(r.mediana_minutos ?? 0),
        }));
        return res.json({ ok: true, items });
    }
    catch (error) {
        console.error("[getTicketsDashboardMonthly]", error);
        return res.status(500).json({ error: "Error obteniendo dashboard de tickets" });
    }
}
// ── GET /api/helpdesk/tickets-dashboard/ranking ──────────────────────────────
export async function getTicketsDashboardRanking(req, res) {
    try {
        const fromDate = typeof req.query.fromDate === "string" ? req.query.fromDate : undefined;
        const toDate = typeof req.query.toDate === "string" ? req.query.toDate : undefined;
        const { sql: dateFilter, params } = buildDateFilter(fromDate, toDate, 1);
        const rows = await prisma.$queryRawUnsafe(`
            SELECT
                e.id_empresa,
                e.nombre                                                AS empresa,
                COUNT(*)                                                AS total_tickets,
                COUNT(*) FILTER (WHERE t."closedAt" IS NOT NULL)       AS tickets_cerrados,
                ROUND(SUM(
                    LEAST(
                        EXTRACT(EPOCH FROM (t."closedAt" - t."createdAt")) / 3600,
                        8.0
                    )
                ) FILTER (WHERE t."closedAt" IS NOT NULL)::numeric, 1) AS horas_cap8h,
                ROUND(
                    COUNT(*) FILTER (
                        WHERE t."closedAt" IS NOT NULL
                        AND EXTRACT(EPOCH FROM (t."closedAt" - t."createdAt")) / 3600 <= 8
                    ) * 100.0 / NULLIF(COUNT(*) FILTER (WHERE t."closedAt" IS NOT NULL), 0)
                , 1)                                                    AS pct_resueltos_8h,
                COUNT(*) FILTER (
                    WHERE t."closedAt" IS NOT NULL
                    AND EXTRACT(EPOCH FROM (t."closedAt" - t."createdAt")) / 3600 > 8
                )                                                       AS tickets_complejos,
                ROUND(PERCENTILE_CONT(0.5) WITHIN GROUP (
                    ORDER BY EXTRACT(EPOCH FROM (t."closedAt" - t."createdAt")) / 60
                ) FILTER (
                    WHERE t."closedAt" IS NOT NULL
                    AND EXTRACT(EPOCH FROM (t."closedAt" - t."createdAt")) / 3600 <= 8
                )::numeric, 0)                                          AS mediana_minutos
            FROM "Ticket" t
            JOIN "Empresa" e ON e.id_empresa = t."empresaId"
            WHERE t."createdAt" IS NOT NULL
            ${dateFilter}
            GROUP BY e.id_empresa, e.nombre
            ORDER BY horas_cap8h DESC, total_tickets DESC
        `, ...params);
        const items = rows.map((r) => ({
            id_empresa: Number(r.id_empresa),
            empresa: r.empresa,
            total_tickets: Number(r.total_tickets),
            tickets_cerrados: Number(r.tickets_cerrados),
            horas_cap8h: Number(r.horas_cap8h ?? 0),
            pct_resueltos_8h: Number(r.pct_resueltos_8h ?? 0),
            tickets_complejos: Number(r.tickets_complejos),
            mediana_minutos: Number(r.mediana_minutos ?? 0),
        }));
        const summary = {
            totalEmpresas: items.length,
            totalTickets: items.reduce((a, r) => a + r.total_tickets, 0),
            totalHoras: items.reduce((a, r) => a + r.horas_cap8h, 0),
            totalComplejos: items.reduce((a, r) => a + r.tickets_complejos, 0),
        };
        return res.json({ ok: true, items, summary });
    }
    catch (error) {
        console.error("[getTicketsDashboardRanking]", error);
        return res.status(500).json({ error: "Error obteniendo ranking de tickets" });
    }
}
//# sourceMappingURL=ticketDashboard.controller.js.map