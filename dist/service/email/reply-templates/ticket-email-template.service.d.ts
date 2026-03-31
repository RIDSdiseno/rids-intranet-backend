import { type TemplateKey } from "./ticket-email-template.defaults.js";
type RenderVars = Record<string, string | number | boolean | null | undefined>;
type TecnicoFirmaInput = {
    nombre?: string | null;
    email?: string | null;
    cargo?: string | null;
    area?: string | null;
    firmaPath?: string | null;
};
declare class TicketEmailTemplateService {
    private defaultLogo;
    ensureDefaults(): Promise<void>;
    getTemplate(key: TemplateKey): Promise<import("./ticket-email-template.defaults.js").TicketEmailTemplateDefault | {
        id: number;
        updatedAt: Date;
        name: string;
        createdAt: Date;
        key: string;
        subjectTpl: string;
        bodyHtmlTpl: string;
        isEnabled: boolean;
    }>;
    escapeHtml(text?: string): string;
    toHtmlEntities(str?: string): string;
    textToHtml(text?: string): string;
    renderString(template: string, vars: RenderVars): string;
    buildFirmaHtml(tecnico?: TecnicoFirmaInput | null): Promise<string>;
    render(params: {
        key: TemplateKey;
        vars: RenderVars;
        tecnico?: TecnicoFirmaInput | null;
    }): Promise<{
        template: import("./ticket-email-template.defaults.js").TicketEmailTemplateDefault | {
            id: number;
            updatedAt: Date;
            name: string;
            createdAt: Date;
            key: string;
            subjectTpl: string;
            bodyHtmlTpl: string;
            isEnabled: boolean;
        };
        subject: string;
        bodyHtml: string;
        isEnabled: boolean;
    }>;
    list(): Promise<{
        id: number;
        updatedAt: Date;
        name: string;
        createdAt: Date;
        key: string;
        subjectTpl: string;
        bodyHtmlTpl: string;
        isEnabled: boolean;
    }[]>;
    update(params: {
        key: TemplateKey;
        subjectTpl?: string;
        bodyHtmlTpl?: string;
        isEnabled?: boolean;
        name?: string;
    }): Promise<{
        id: number;
        updatedAt: Date;
        name: string;
        createdAt: Date;
        key: string;
        subjectTpl: string;
        bodyHtmlTpl: string;
        isEnabled: boolean;
    }>;
    preview(params: {
        key: TemplateKey;
        subjectTpl?: string;
        bodyHtmlTpl?: string;
    }): Promise<{
        subject: string;
        bodyHtml: string;
    }>;
    getSignatureSettings(): Promise<{
        id: number;
        updatedAt: Date;
        nombre: string;
        email: string;
        telefono: string | null;
        cargo: string;
        createdAt: Date;
        area: string;
        isEnabled: boolean;
        sitioWeb1: string | null;
        sitioWeb2: string | null;
        imageUrl: string | null;
    }>;
}
export declare const ticketEmailTemplateService: TicketEmailTemplateService;
export {};
//# sourceMappingURL=ticket-email-template.service.d.ts.map