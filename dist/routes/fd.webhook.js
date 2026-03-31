import { Router } from "express";
import { fd } from "../fd/client.js";
import { upsertTicketBatch } from "../fd/upsert.js";
export const fdWebhookRouter = Router();
/**
 * Freshdesk → POST /api/fd/webhook
 * Header requerido:  X-FD-Secret: <FD_WEBHOOK_SECRET>
 * Body (JSON o x-www-form-urlencoded):
 *   { "ticket_id": 12345 }
 */
fdWebhookRouter.post("/webhook", async (req, res) => {
    try {
        const incoming = (req.header("X-FD-Secret") ?? "").trim();
        const expected = (process.env.FD_WEBHOOK_SECRET ?? "").trim();
        if (!incoming || incoming !== expected) {
            return res.status(401).json({ ok: false, error: "unauthorized" });
        }
        const b = req.body ?? {};
        const ticketId = Number(b.ticket_id ?? b.id ?? b.ticket?.id ?? b.data?.ticket_id ?? req.query.ticket_id);
        if (!ticketId || Number.isNaN(ticketId)) {
            return res.status(400).json({ ok: false, error: "missing ticket_id" });
        }
        const { data: ticket } = await fd.get(`/tickets/${ticketId}`, {
            params: { include: "requester,company,stats" },
        });
        const status = Number(ticket?.status);
        if (status !== 5) {
            return res.json({ ok: true, skipped: "not closed", id: ticketId, status });
        }
        await upsertTicketBatch([ticket]);
        return res.json({ ok: true, saved: ticketId });
    }
    catch (e) {
        console.error("[FD WEBHOOK] error:", e?.response?.data || e?.message || e);
        return res.status(500).json({ ok: false, error: e?.message || "error" });
    }
});
//# sourceMappingURL=fd.webhook.js.map