import { prisma } from "../../../lib/prisma.js";
import { DEFAULT_TICKET_EMAIL_TEMPLATES, } from "./ticket-email-template.defaults.js";
class TicketEmailTemplateService {
    defaultLogo = "https://res.cloudinary.com/dvqpmttci/image/upload/v1774008233/Logo_Firma_bcm1bs.gif";
    async ensureDefaults() {
        for (const tpl of DEFAULT_TICKET_EMAIL_TEMPLATES) {
            const exists = await prisma.ticketEmailTemplate.findUnique({
                where: { key: tpl.key },
                select: { id: true },
            });
            if (!exists) {
                await prisma.ticketEmailTemplate.create({ data: tpl });
            }
        }
    }
    async getTemplate(key) {
        await this.ensureDefaults();
        const tpl = await prisma.ticketEmailTemplate.findUnique({
            where: { key },
        });
        if (tpl)
            return tpl;
        const fallback = DEFAULT_TICKET_EMAIL_TEMPLATES.find(t => t.key === key);
        if (!fallback) {
            throw new Error(`Template no encontrado: ${key}`);
        }
        return fallback;
    }
    escapeHtml(text = "") {
        return text
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#039;");
    }
    toHtmlEntities(str = "") {
        return str
            .replace(/á/g, "&aacute;")
            .replace(/é/g, "&eacute;")
            .replace(/í/g, "&iacute;")
            .replace(/ó/g, "&oacute;")
            .replace(/ú/g, "&uacute;")
            .replace(/Á/g, "&Aacute;")
            .replace(/É/g, "&Eacute;")
            .replace(/Í/g, "&Iacute;")
            .replace(/Ó/g, "&Oacute;")
            .replace(/Ú/g, "&Uacute;")
            .replace(/ñ/g, "&ntilde;")
            .replace(/Ñ/g, "&Ntilde;")
            .replace(/ü/g, "&uuml;");
    }
    textToHtml(text = "") {
        return this.escapeHtml(text).replace(/\n/g, "<br/>");
    }
    renderString(template, vars) {
        let output = template;
        for (const [key, value] of Object.entries(vars)) {
            const safeValue = String(value ?? "");
            const regex = new RegExp(`{{\\s*${key}\\s*}}`, "g");
            output = output.replace(regex, safeValue);
        }
        return output;
    }
    async buildFirmaHtml(tecnico) {
        const settings = await this.getSignatureSettings();
        if (!tecnico && !settings.isEnabled) {
            return "";
        }
        const nombre = this.toHtmlEntities(tecnico?.nombre || settings.nombre || "Equipo de Soporte T&eacute;cnico");
        const email = tecnico?.email || settings.email || "soporte@rids.cl";
        const cargo = this.toHtmlEntities(tecnico?.cargo || settings.cargo || "Soporte T&eacute;cnico");
        const area = this.toHtmlEntities(tecnico?.area || settings.area || "Asesorías RIDS Ltda.");
        const firmaPath = tecnico?.firmaPath ||
            settings.imageUrl ||
            this.defaultLogo;
        const telefono = settings.telefono || "";
        const sitioWeb1 = settings.sitioWeb1 || "";
        const sitioWeb2 = settings.sitioWeb2 || "";
        return `
<table cellpadding="0" cellspacing="0" style="margin-top:16px;">
  <tr>
    <td style="padding-right:16px; vertical-align:middle;">
      <img src="${firmaPath}" width="120" />
    </td>
    <td style="border-left:2px solid #ddd; padding-left:16px; vertical-align:middle; font-family:Arial, sans-serif; font-size:13px; color:#333; line-height:1.6;">
      <strong style="font-size:14px;">${nombre}</strong><br/>
      <span style="color:#555;">${cargo}</span><br/>
      <span style="color:#555;">${area}</span><br/>
      <a href="mailto:${email}" style="color:#0ea5e9;">${email}</a><br/>
      ${telefono ? `WhatsApp: ${telefono}<br/>` : ""}
      ${sitioWeb1 ? `<a href="http://${sitioWeb1}" style="color:#0ea5e9;">${sitioWeb1}</a>` : ""}
      ${sitioWeb1 && sitioWeb2 ? " · " : ""}
      ${sitioWeb2 ? `<a href="http://${sitioWeb2}" style="color:#0ea5e9;">${sitioWeb2}</a>` : ""}
    </td>
  </tr>
</table>`.trim();
    }
    async render(params) {
        const tpl = await this.getTemplate(params.key);
        const firmaHtml = await this.buildFirmaHtml(params.tecnico);
        const subject = this.renderString(tpl.subjectTpl, {
            ...params.vars,
            firmaHtml,
        });
        const bodyHtml = this.renderString(tpl.bodyHtmlTpl, {
            ...params.vars,
            firmaHtml,
        });
        return {
            template: tpl,
            subject,
            bodyHtml,
            isEnabled: tpl.isEnabled,
        };
    }
    async list() {
        await this.ensureDefaults();
        return prisma.ticketEmailTemplate.findMany({
            orderBy: { id: "asc" },
        });
    }
    async update(params) {
        await this.ensureDefaults();
        const existing = await prisma.ticketEmailTemplate.findUnique({
            where: { key: params.key },
        });
        if (!existing) {
            throw new Error(`Template no encontrado: ${params.key}`);
        }
        return prisma.ticketEmailTemplate.update({
            where: { key: params.key },
            data: {
                ...(params.name !== undefined && { name: params.name }),
                ...(params.subjectTpl !== undefined && { subjectTpl: params.subjectTpl }),
                ...(params.bodyHtmlTpl !== undefined && { bodyHtmlTpl: params.bodyHtmlTpl }),
                ...(params.isEnabled !== undefined && { isEnabled: params.isEnabled }),
            },
        });
    }
    async preview(params) {
        const original = await this.getTemplate(params.key);
        const subjectTpl = params.subjectTpl ?? original.subjectTpl;
        const bodyHtmlTpl = params.bodyHtmlTpl ?? original.bodyHtmlTpl;
        const firmaHtml = await this.buildFirmaHtml(null);
        const vars = {
            nombre: "Juan Pérez",
            ticketId: 1234,
            subject: "Problema con impresora",
            bodyOriginal: this.textToHtml("No puedo imprimir desde mi equipo."),
            messageHtml: this.textToHtml("Hemos recibido su solicitud y estamos revisando el caso."),
            nombreTecnico: "Equipo de Soporte Técnico",
            emailTecnico: "soporte@rids.cl",
            cargoTecnico: "Soporte Técnico",
            areaTecnico: "Asesorías RIDS Ltda.",
            firmaHtml,
        };
        return {
            subject: this.renderString(subjectTpl, vars),
            bodyHtml: this.renderString(bodyHtmlTpl, vars),
        };
    }
    async getSignatureSettings() {
        let settings = await prisma.ticketEmailSignature.findFirst({
            orderBy: { id: "asc" },
        });
        if (!settings) {
            settings = await prisma.ticketEmailSignature.create({
                data: {
                    nombre: "Equipo de Soporte Técnico",
                    cargo: "Soporte Técnico",
                    area: "Asesorías RIDS Ltda.",
                    email: "soporte@rids.cl",
                    telefono: "+56 9 8823 1976",
                    sitioWeb1: "www.econnet.cl",
                    sitioWeb2: "www.rids.cl",
                    imageUrl: "https://res.cloudinary.com/dvqpmttci/image/upload/v1774008233/Logo_Firma_bcm1bs.gif",
                    isEnabled: true,
                },
            });
        }
        return settings;
    }
}
export const ticketEmailTemplateService = new TicketEmailTemplateService();
//# sourceMappingURL=ticket-email-template.service.js.map