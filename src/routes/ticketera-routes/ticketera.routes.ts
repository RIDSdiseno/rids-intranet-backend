// src/routes/tickets-rids/ticketera.routes.ts
import { Router } from "express";
import type { Request, Response, NextFunction } from "express";
import { auth } from "../../middlewares/auth.js";
import { onlyRole } from "../../middlewares/roles.js";
import { onlyOwnEmpresa } from "../../middlewares/auth.js";

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
    deleteTicket,
    getTicketsHomeSummary
} from "../../controllers/tickets-rids/ticketera.controller.js";

import { uploadTicketAttachments } from "../../config/multer-tickets.js";
import { getTicketSla } from "../../controllers/tickets-rids/tickets-sla/ticketera-sla.controller.js";
import { buscarContactos } from "../../controllers/tickets-rids/contactos.controller.js";
import {
    listTicketEmailTemplates,
    updateTicketEmailTemplate,
    previewTicketEmailTemplate,
} from "../../controllers/tickets-rids/reply-templates/ticket-email-template.controller.js";
import multer from "multer";
import {
    getTecnicoSignature,
    updateTecnicoSignatureData,
    uploadTecnicoSignatureImage,
    deleteTecnicoSignatureImage,
} from "../../controllers/tickets-rids/reply-templates/tecnico-signature.controller.js";
import { getTicketEmailSignature, updateTicketEmailSignature } from "../../controllers/tickets-rids/reply-templates/ticket-default-signature.controller.js";
import { getTicketMetricsByTecnico, getWorstClosedTicketsByTecnico } from "../../controllers/tickets-rids/tecnicos-metrics.controller.js";
import {
    getTicketsDashboardMonthly,
    getTicketsDashboardRanking,
} from "../../controllers/tickets-rids/dashboard/ticketDashboard.controller.js";
import {
    getSlaConfig,
    updateSlaConfig,
} from "../../controllers/tickets-rids/tickets-sla/sla-config.controller.js";

const ticketeraRouter = Router();
const upload = multer({ storage: multer.memoryStorage() });

// ─── Roles que pueden operar internamente ────────────────────────────────────
const ROLES_INTERNOS = ["ADMIN", "ADMINISTRACION", "TECNICO", "VENTAS"] as const;
const ROLES_ADMIN = ["ADMIN", "ADMINISTRACION"] as const;

// =======================
// INBOUND EMAIL (sin auth — webhook externo)
// =======================
ticketeraRouter.post("/inbound-email", inboundEmail);

// =======================
// PROXY IMAGEN EXTERNA (sin auth — usado desde email embebido)
// =======================
ticketeraRouter.get("/external-image", proxyExternalImage);

// =======================
// CRUD BASE
// =======================

// Crear ticket — solo roles internos
ticketeraRouter.post(
    "/",
    auth(),
    onlyRole(...ROLES_INTERNOS),
    uploadTicketAttachments.array("attachments", 10),
    (err: any, _req: Request, res: Response, next: NextFunction) => {
        if (err) return res.status(400).json({ ok: false, message: err.message });
        return next();
    },
    createTicket
);

// Listar tickets — auth requerido; CLIENTE filtra por su empresa (lógica en controller)
ticketeraRouter.get(
    "/",
    auth(),
    onlyOwnEmpresa(),
    listTickets
);

// =======================
// RUTAS FIJAS SOLO INTERNAS (antes de /:id)
// =======================

// SLA, KPIs, dashboards — no exponer a CLIENTEs
ticketeraRouter.get("/sla", auth(), onlyRole(...ROLES_INTERNOS), getTicketSla);

// Home summary — disponible para todos los autenticados (muestra conteos propios para cliente)
ticketeraRouter.get(
    "/home-summary",
    auth(),
    onlyOwnEmpresa(),
    getTicketsHomeSummary
);

// Bulk — solo internos
ticketeraRouter.patch("/bulk", auth(), onlyRole(...ROLES_INTERNOS), bulkUpdateTickets);
ticketeraRouter.post("/bulk-merge", auth(), onlyRole(...ROLES_INTERNOS), bulkMergeTickets);

// =======================
// CONTACTOS
// =======================
ticketeraRouter.get("/contactos", auth(), onlyRole(...ROLES_INTERNOS), buscarContactos);

// =======================
// MÉTRICAS TÉCNICOS — solo internos
// =======================
ticketeraRouter.get("/tecnicos/metrics", auth(), onlyRole(...ROLES_INTERNOS), getTicketMetricsByTecnico);
ticketeraRouter.get("/tecnicos/worst-closed", auth(), onlyRole(...ROLES_INTERNOS), getWorstClosedTicketsByTecnico);

// =======================
// MÉTRICAS TICKETS — solo internos
// =======================
ticketeraRouter.get("/dashboard-empresas/monthly", auth(), onlyRole(...ROLES_INTERNOS), getTicketsDashboardMonthly);
ticketeraRouter.get("/dashboard-empresas/ranking", auth(), onlyRole(...ROLES_INTERNOS), getTicketsDashboardRanking);

// =======================
// PLANTILLAS / FIRMAS — solo ADMIN
// =======================
ticketeraRouter.get("/email-templates", auth(), onlyRole(...ROLES_ADMIN), listTicketEmailTemplates);
ticketeraRouter.put("/email-templates", auth(), onlyRole(...ROLES_ADMIN), updateTicketEmailTemplate);
ticketeraRouter.post("/email-templates/preview", auth(), onlyRole(...ROLES_ADMIN), previewTicketEmailTemplate);
ticketeraRouter.get("/email-signature", auth(), onlyRole(...ROLES_ADMIN), getTicketEmailSignature);
ticketeraRouter.put("/email-signature", auth(), onlyRole(...ROLES_ADMIN), updateTicketEmailSignature);

// =======================
// SLA CONFIG — solo ADMIN
// =======================
ticketeraRouter.get("/sla-config", auth(), onlyRole(...ROLES_ADMIN), getSlaConfig);
ticketeraRouter.patch("/sla-config/:priority", auth(), onlyRole(...ROLES_ADMIN), updateSlaConfig);

// =======================
// ATTACHMENTS — auth requerido; CLIENTE solo puede descargar adjuntos de sus propios tickets
// (la verificación de pertenencia se hace en el controller)
// =======================
ticketeraRouter.get(
    "/attachments/:attachmentId/download",
    auth(),
    onlyOwnEmpresa(),
    downloadTicketAttachment
);

// =======================
// FIRMAS TÉCNICOS — solo internos
// =======================
ticketeraRouter.get("/tecnicos/:id/signature", auth(), onlyRole(...ROLES_INTERNOS), getTecnicoSignature);
ticketeraRouter.put("/tecnicos/:id/signature", auth(), onlyRole(...ROLES_INTERNOS), updateTecnicoSignatureData);
ticketeraRouter.post("/tecnicos/:id/signature/image", auth(), onlyRole(...ROLES_INTERNOS), upload.single("file"), uploadTecnicoSignatureImage);
ticketeraRouter.delete("/tecnicos/:id/signature/image", auth(), onlyRole(...ROLES_ADMIN), deleteTecnicoSignatureImage);

// =======================
// RUTAS CON /:id — AL FINAL
// =======================

// Ver ticket — auth + filtro por empresa para CLIENTE
ticketeraRouter.get(
    "/:id",
    auth(),
    onlyOwnEmpresa(),
    getTicketById
);

// Actualizar — solo internos
ticketeraRouter.patch(
    "/:id",
    auth(),
    onlyRole(...ROLES_INTERNOS),
    updateTicket
);

// Responder — solo internos
ticketeraRouter.post(
    "/:id/reply",
    auth(),
    onlyRole(...ROLES_INTERNOS),
    uploadTicketAttachments.array("attachments"),
    (err: any, _req: Request, res: Response, next: NextFunction) => {
        if (err) return res.status(400).json({ ok: false, message: err.message });
        return next();
    },
    replyTicketAsAgent
);

// Eliminar — solo ADMIN
ticketeraRouter.delete(
    "/:id",
    auth(),
    onlyRole(...ROLES_ADMIN),
    deleteTicket
);

export default ticketeraRouter;