// src/routes/tickets-rids/ticketera.routes.ts
import { Router } from "express";
import { createTicket, replyTicketAsAgent, listTickets, getTicketById, updateTicket, inboundEmail } from "../../controllers/tickets-rids/ticketera.controller.js";
// 🆕 Importar controlador de email
import { processEmails } from "../../controllers/tickets-rids/email.controller.js";
import { getTicketSla } from "../../controllers/tickets-rids/ticketera-sla.controller.js";
import { getTicketKpis, getTicketKpisByAgent, } from "../../controllers/tickets-rids/ticketera-kpis.controller.js";
import { getAgentDashboard } from "../../controllers/tickets-rids/agent-dashboard.controller.js";
import { getTicketQueues } from "../../controllers/tickets-rids/cola-tickets.controller.js";
const ticketeraRouter = Router();
// =======================
// CRUD base
// =======================
ticketeraRouter.post("/", createTicket);
ticketeraRouter.get("/", listTickets);
// =======================
// EMAIL ENDPOINTS
// =======================
ticketeraRouter.post("/inbound-email", inboundEmail); // Webhook legacy
ticketeraRouter.post("/process-emails", processEmails); // Procesar emails IMAP manualmente
// =======================
// RUTAS FIJAS (ANTES DE :id)
// =======================
ticketeraRouter.get("/sla", getTicketSla);
ticketeraRouter.get("/kpis", getTicketKpis);
ticketeraRouter.get("/kpis/agent", getTicketKpisByAgent);
ticketeraRouter.get("/dashboard", getAgentDashboard);
ticketeraRouter.get("/queues", getTicketQueues);
// =======================
// RUTAS CON ID (AL FINAL)
// =======================
ticketeraRouter.get("/:id", getTicketById);
ticketeraRouter.patch("/:id", updateTicket);
ticketeraRouter.post("/:id/reply", replyTicketAsAgent);
export default ticketeraRouter;
//# sourceMappingURL=ticketera.routes.js.map