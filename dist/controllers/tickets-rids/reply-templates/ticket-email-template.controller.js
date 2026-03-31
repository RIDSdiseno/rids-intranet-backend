import { ticketEmailTemplateService } from "../../../service/email/reply-templates/ticket-email-template.service.js";
export async function listTicketEmailTemplates(_req, res) {
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
    }
    catch (error) {
        console.error("[helpdesk] listTicketEmailTemplates error:", error);
        return res.status(500).json({
            ok: false,
            message: "Error al obtener plantillas",
        });
    }
}
export async function updateTicketEmailTemplate(req, res) {
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
    }
    catch (error) {
        console.error("[helpdesk] updateTicketEmailTemplate error:", error);
        return res.status(500).json({
            ok: false,
            message: "Error al actualizar plantilla",
        });
    }
}
export async function previewTicketEmailTemplate(req, res) {
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
    }
    catch (error) {
        console.error("[helpdesk] previewTicketEmailTemplate error:", error);
        return res.status(500).json({
            ok: false,
            message: "Error al generar preview",
        });
    }
}
//# sourceMappingURL=ticket-email-template.controller.js.map