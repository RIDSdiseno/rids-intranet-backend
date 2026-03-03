// src/routes/tickets-rids/ticketera.routes.ts
import { Router } from "express";
import type { Request, Response, NextFunction } from "express";

import {
    createTicket,
    replyTicketAsAgent,
    listTickets,
    getTicketById,
    updateTicket,
    inboundEmail,
    downloadTicketAttachment,
    proxyExternalImage,
    bulkUpdateTickets,
    bulkMergeTickets,
    deleteTicket
} from "../../controllers/tickets-rids/ticketera.controller.js";

import { uploadTicketAttachments } from "../../config/multer-tickets.js";

import { processEmails } from "../../controllers/tickets-rids/email.controller.js";

import { getTicketSla } from "../../controllers/tickets-rids/ticketera-sla.controller.js";
import {
    getTicketKpis,
    getTicketKpisByAgent,
} from "../../controllers/tickets-rids/ticketera-kpis.controller.js";

import { getAgentDashboard } from "../../controllers/tickets-rids/agent-dashboard.controller.js";
import { getTicketQueues } from "../../controllers/tickets-rids/cola-tickets.controller.js";

const ticketeraRouter = Router();

// =======================
// CRUD base
// =======================
ticketeraRouter.post("/", createTicket);
ticketeraRouter.get("/", listTickets);

// =======================
// RUTAS FIJAS (ANTES DE :id)
// =======================
ticketeraRouter.get("/external-image", proxyExternalImage);
ticketeraRouter.get("/sla", getTicketSla);
ticketeraRouter.get("/kpis", getTicketKpis);
ticketeraRouter.get("/kpis/agent", getTicketKpisByAgent);
ticketeraRouter.get("/dashboard", getAgentDashboard);
ticketeraRouter.get("/queues", getTicketQueues);
ticketeraRouter.patch("/bulk", bulkUpdateTickets);
ticketeraRouter.post("/bulk-merge", bulkMergeTickets);

// =======================
// EMAIL ENDPOINTS
// =======================
ticketeraRouter.post("/inbound-email", inboundEmail);
ticketeraRouter.post("/process-emails", processEmails);

// =======================
// ATTACHMENTS
// =======================
ticketeraRouter.get("/attachments/:attachmentId/download", downloadTicketAttachment);

// =======================
// RUTAS CON ID (AL FINAL)
// =======================
ticketeraRouter.get("/:id", getTicketById);
ticketeraRouter.patch("/:id", updateTicket);
ticketeraRouter.post("/:id/reply",uploadTicketAttachments.array("attachments"),(err: any, _req: Request, res: Response, next: NextFunction) => {
    if (err) {
            return res.status(400).json({ ok: false, message: err.message });
        }
        return next();
    },
    replyTicketAsAgent
);

ticketeraRouter.delete("/:id", deleteTicket);

export default ticketeraRouter;
