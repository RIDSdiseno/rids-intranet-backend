// controllers/tickets-rids/reply-templates/ticket-email-template.controller.ts
import type { Request, Response } from "express";
import { ticketEmailTemplateService } from "../../../service/email/reply-templates/ticket-email-template.service.js";

// Controlador para listar las plantillas de email para tickets, incluyendo variables disponibles
export async function listTicketEmailTemplates(_req: Request, res: Response) {
    try {
        const data = await ticketEmailTemplateService.list();

        return res.json({
            ok: true,
            data,
            availableVariables: [
                "{{nombre}}",
                "{{ticketId}}",
                "{{subject}}",
                "{{bodyOriginal}}",
                "{{messageHtml}}",
                "{{firmaHtml}}",
                "{{nombreTecnico}}",
                "{{emailTecnico}}",
                "{{cargoTecnico}}",
                "{{areaTecnico}}",
            ],
        });
    } catch (error) {
        console.error("[helpdesk] listTicketEmailTemplates error:", error);
        return res.status(500).json({
            ok: false,
            message: "Error al obtener plantillas",
        });
    }
}

// Controlador para actualizar o crear una plantilla de email para tickets
export async function updateTicketEmailTemplate(req: Request, res: Response) {
    try {
        const { key, subjectTpl, bodyHtmlTpl, isEnabled, name } = req.body;

        if (!key) {
            return res.status(400).json({
                ok: false,
                message: "key es obligatorio",
            });
        }

        const data = await ticketEmailTemplateService.update({
            key,
            subjectTpl,
            bodyHtmlTpl,
            isEnabled,
            name,
        });

        return res.json({
            ok: true,
            data,
        });
    } catch (error) {
        console.error("[helpdesk] updateTicketEmailTemplate error:", error);
        return res.status(500).json({
            ok: false,
            message: "Error al actualizar plantilla",
        });
    }
}

// Controlador para generar una vista previa de una plantilla de email para tickets con datos de ejemplo
export async function previewTicketEmailTemplate(req: Request, res: Response) {
    try {
        const { key, subjectTpl, bodyHtmlTpl } = req.body;

        if (!key) {
            return res.status(400).json({
                ok: false,
                message: "key es obligatorio",
            });
        }

        const data = await ticketEmailTemplateService.preview({
            key,
            subjectTpl,
            bodyHtmlTpl,
        });

        return res.json({
            ok: true,
            data,
        });
    } catch (error) {
        console.error("[helpdesk] previewTicketEmailTemplate error:", error);
        return res.status(500).json({
            ok: false,
            message: "Error al generar preview",
        });
    }
}