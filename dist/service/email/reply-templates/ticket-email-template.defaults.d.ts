export declare const TICKET_EMAIL_TEMPLATE_KEYS: {
    readonly AUTO_REPLY_INBOUND: "AUTO_REPLY_INBOUND";
    readonly TICKET_CREATED_WEB: "TICKET_CREATED_WEB";
    readonly AGENT_REPLY: "AGENT_REPLY";
};
export type TemplateKey = typeof TICKET_EMAIL_TEMPLATE_KEYS[keyof typeof TICKET_EMAIL_TEMPLATE_KEYS];
export type TicketEmailTemplateDefault = {
    key: TemplateKey;
    name: string;
    subjectTpl: string;
    bodyHtmlTpl: string;
    isEnabled: boolean;
};
export declare const DEFAULT_TICKET_EMAIL_TEMPLATES: TicketEmailTemplateDefault[];
//# sourceMappingURL=ticket-email-template.defaults.d.ts.map