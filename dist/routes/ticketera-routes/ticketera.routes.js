// src/routes/tickets-rids/ticketera.routes.ts
import { Router } from "express";
import { createTicket, replyTicketAsAgent, listTickets, getTicketById, updateTicket, inboundEmail, downloadTicketAttachment, proxyExternalImage, bulkUpdateTickets, bulkMergeTickets, deleteTicket } from "../../controllers/tickets-rids/ticketera.controller.js";
import { uploadTicketAttachments } from "../../config/multer-tickets.js";
import { processEmails } from "../../controllers/tickets-rids/email.controller.js";
import { getTicketSla } from "../../controllers/tickets-rids/tickets-sla/ticketera-sla.controller.js";
import { getTicketKpis, getTicketKpisByAgent, } from "../../controllers/tickets-rids/ticketera-kpis.controller.js";
import { getAgentDashboard } from "../../controllers/tickets-rids/agent-dashboard.controller.js";
import { getTicketQueues } from "../../controllers/tickets-rids/cola-tickets.controller.js";
import { buscarContactos } from "../../controllers/tickets-rids/contactos.controller.js";
import { listTicketEmailTemplates, updateTicketEmailTemplate, previewTicketEmailTemplate, } from "../../controllers/tickets-rids/reply-templates/ticket-email-template.controller.js";
import multer from "multer";
import { getTecnicoSignature, updateTecnicoSignatureData, uploadTecnicoSignatureImage, deleteTecnicoSignatureImage, } from "../../controllers/tickets-rids/reply-templates/tecnico-signature.controller.js";
import { getTicketEmailSignature, updateTicketEmailSignature } from "../../controllers/tickets-rids/reply-templates/ticket-default-signature.controller.js";
import { getTicketMetricsByTecnico } from "../../controllers/tickets-rids/tecnicos-metrics.controller.js";
import { getTicketsDashboardMonthly, getTicketsDashboardRanking, } from "../../controllers/tickets-rids/dashboard/ticketDashboard.controller.js";
import { getSlaConfig, updateSlaConfig, } from "../../controllers/tickets-rids/tickets-sla/sla-config.controller.js";
const ticketeraRouter = Router();
const upload = multer({ storage: multer.memoryStorage() });
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
// CONTACTOS
// =======================
ticketeraRouter.get("/contactos", buscarContactos);
// =======================
// MÉTRICAS TÉCNICOS
// =======================
ticketeraRouter.get("/tecnicos/metrics", getTicketMetricsByTecnico);
// =======================
// MÉTRICAS TICKETS
// =======================
ticketeraRouter.get("/dashboard-empresas/monthly", getTicketsDashboardMonthly);
ticketeraRouter.get("/dashboard-empresas/ranking", getTicketsDashboardRanking);
// =======================
// PLANTILLAS DE EMAIL
// =======================
ticketeraRouter.get("/email-templates", listTicketEmailTemplates);
ticketeraRouter.put("/email-templates", updateTicketEmailTemplate);
ticketeraRouter.post("/email-templates/preview", previewTicketEmailTemplate);
ticketeraRouter.get("/email-signature", getTicketEmailSignature);
ticketeraRouter.put("/email-signature", updateTicketEmailSignature);
// =======================
// EMAIL ENDPOINTS
// =======================
ticketeraRouter.post("/inbound-email", inboundEmail);
ticketeraRouter.post("/process-emails", processEmails);
// =======================
// SLA CONFIG
// =======================
ticketeraRouter.get("/sla-config", getSlaConfig);
ticketeraRouter.patch("/sla-config/:priority", updateSlaConfig);
// =======================
// ATTACHMENTS
// =======================
ticketeraRouter.get("/attachments/:attachmentId/download", downloadTicketAttachment);
// =======================
// FIRMAS TÉCNICOS
// =======================
ticketeraRouter.get("/tecnicos/:id/signature", getTecnicoSignature);
ticketeraRouter.put("/tecnicos/:id/signature", updateTecnicoSignatureData);
ticketeraRouter.post("/tecnicos/:id/signature/image", upload.single("file"), uploadTecnicoSignatureImage);
ticketeraRouter.delete("/tecnicos/:id/signature/image", deleteTecnicoSignatureImage);
// =======================
// RUTAS CON ID (AL FINAL)
// =======================
ticketeraRouter.get("/:id", getTicketById);
ticketeraRouter.patch("/:id", updateTicket);
ticketeraRouter.post("/:id/reply", uploadTicketAttachments.array("attachments"), (err, _req, res, next) => {
    if (err) {
        return res.status(400).json({ ok: false, message: err.message });
    }
    return next();
}, replyTicketAsAgent);
ticketeraRouter.delete("/:id", deleteTicket);
export default ticketeraRouter;
//# sourceMappingURL=ticketera.routes.js.map