import "isomorphic-fetch";
export type EmailAttachment = {
    name: string;
    contentType: string;
    contentBytes: string;
    isInline?: boolean;
    contentId?: string;
};
export type SendEmailInput = {
    to: string;
    subject: string;
    bodyHtml: string;
    attachments?: EmailAttachment[];
    replyTo?: string;
};
export type SendEmailResult = {
    proveedor: "graph" | "smtp";
    /** Graph no devuelve id de mensaje en sendMail (responde 202). */
    messageId: string | null;
    accepted: string[];
    rejected: string[];
};
export declare function sendEmail(input: SendEmailInput): Promise<SendEmailResult>;
//# sourceMappingURL=masivos-email-sender.service.d.ts.map