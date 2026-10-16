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
export declare function sendEmail({ to, subject, bodyHtml, attachments, replyTo, }: SendEmailInput): Promise<{
    messageId: string;
    accepted: (string | import("nodemailer/lib/mailer/index.js").Address)[];
    rejected: (string | import("nodemailer/lib/mailer/index.js").Address)[];
}>;
//# sourceMappingURL=masivos-email-sender.service.d.ts.map