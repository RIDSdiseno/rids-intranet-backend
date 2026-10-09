import {
    transporter,
} from "../../lib/mailer.js";

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

const SMTP_FROM =
    process.env.SMTP_FROM?.trim() ||
    process.env.SMTP_USER?.trim();

if (!SMTP_FROM) {
    console.warn(
        "[EmailSender] SMTP_FROM / SMTP_USER no configurado"
    );
}

export async function sendEmail({
    to,
    subject,
    bodyHtml,
    attachments = [],
    replyTo,
}: SendEmailInput) {

    if (!SMTP_FROM) {
        throw new Error(
            "No existe remitente SMTP configurado"
        );
    }

    const nodemailerAttachments =
        attachments.map(
            (attachment) => ({
                filename:
                    attachment.name,

                content:
                    attachment.contentBytes,

                encoding:
                    "base64" as const,

                contentType:
                    attachment.contentType,

                ...(attachment.isInline &&
                    attachment.contentId
                    ? {
                        cid:
                            attachment.contentId,

                        contentDisposition:
                            "inline" as const,
                    }
                    : {
                        contentDisposition:
                            "attachment" as const,
                    }),
            })
        );

    const info =
        await transporter.sendMail({
            from:
                SMTP_FROM,

            to,

            subject,

            html:
                bodyHtml,

            ...(replyTo
                ? {
                    replyTo,
                }
                : {}),

            attachments:
                nodemailerAttachments,
        });

    return {
        messageId:
            info.messageId,

        accepted:
            info.accepted,

        rejected:
            info.rejected,
    };
}