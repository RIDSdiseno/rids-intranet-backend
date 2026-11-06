// src/service/correos-masivos/masivos-email-sender.service.ts

/* =========================================================
   ENVÍO DE CORREOS MASIVOS Y CAMPAÑAS DE PROTECCIÓN DE DATOS

   Lo usan correos-masivos.service.ts y
   proteccion-datos-email.service.ts (misma función sendEmail).

   Proveedor según MAILER_PROVIDER:
     graph  Microsoft Graph, buzón GRAPH_MAILER_USER, con la app
            MICROSOFT_TENANT_ID / MICROSOFT_CLIENT_ID /
            MICROSOFT_CLIENT_SECRET (permiso de aplicación Mail.Send)
     smtp   (por defecto) nodemailer con SMTP_* (lib/mailer.ts)
   ========================================================= */

import {
    Client,
} from "@microsoft/microsoft-graph-client";

import {
    ClientSecretCredential,
} from "@azure/identity";

import "isomorphic-fetch";

import {
    transporter,
} from "../../lib/mailer.js";

/* =========================================================
   TIPOS
   ========================================================= */

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
    proveedor:
    | "graph"
    | "smtp";

    /** Graph no devuelve id de mensaje en sendMail (responde 202). */
    messageId:
    string | null;

    accepted:
    string[];

    rejected:
    string[];
};

/* =========================================================
   CONFIGURACIÓN
   ========================================================= */

const PROVEEDOR: "graph" | "smtp" =
    (process.env.MAILER_PROVIDER || "smtp")
        .trim()
        .toLowerCase() === "graph"
        ? "graph"
        : "smtp";

const SMTP_FROM =
    process.env.SMTP_FROM?.trim() ||
    process.env.SMTP_USER?.trim();

/*
 * Buzón remitente. Por defecto el de soporte (EMAIL_USER, el mismo que usa
 * el helpdesk con Graph). GRAPH_MAILER_USER permite usar otro buzón solo
 * para campañas y correos masivos.
 */
const GRAPH_MAILER_USER =
    (
        process.env.GRAPH_MAILER_USER ||
        process.env.EMAIL_USER ||
        ""
    )
        .trim()
        .toLowerCase();

/*
 * sendMail de Graph recibe todo en una solicitud JSON (máx. ~4 MB,
 * con los adjuntos en base64). Se deja margen para el resto del mensaje.
 */
const LIMITE_GRAPH_BYTES =
    3 * 1024 * 1024;

if (
    PROVEEDOR === "graph" &&
    !GRAPH_MAILER_USER
) {
    console.warn(
        "[EmailSender] MAILER_PROVIDER=graph pero no hay buzón remitente (GRAPH_MAILER_USER o EMAIL_USER)"
    );
}

if (
    PROVEEDOR === "smtp" &&
    !SMTP_FROM
) {
    console.warn(
        "[EmailSender] SMTP_FROM / SMTP_USER no configurado"
    );
}

console.log(
    "[EmailSender] Proveedor de correos masivos:",
    PROVEEDOR === "graph"
        ? `Microsoft Graph (${GRAPH_MAILER_USER || "sin buzón"})`
        : "SMTP"
);

/* =========================================================
   MICROSOFT GRAPH
   ========================================================= */

let graphClient:
    Client | null =
    null;

function getGraphClient(): Client {
    if (graphClient) {
        return graphClient;
    }

    const tenantId =
        process.env.MICROSOFT_TENANT_ID?.trim();

    const clientId =
        process.env.MICROSOFT_CLIENT_ID?.trim();

    const clientSecret =
        process.env.MICROSOFT_CLIENT_SECRET?.trim();

    if (
        !tenantId ||
        !clientId ||
        !clientSecret
    ) {
        throw new Error(
            "Configuración Microsoft Graph incompleta (MICROSOFT_TENANT_ID / MICROSOFT_CLIENT_ID / MICROSOFT_CLIENT_SECRET)"
        );
    }

    /*
     * ClientSecretCredential guarda el token en memoria
     * y lo renueva solo cuando vence.
     */
    const credential =
        new ClientSecretCredential(
            tenantId,
            clientId,
            clientSecret
        );

    /*
     * El middleware por defecto del cliente reintenta
     * 429 / 503 / 504 respetando Retry-After.
     */
    graphClient =
        Client.init({
            authProvider:
                async (done) => {
                    try {
                        const token =
                            await credential.getToken(
                                "https://graph.microsoft.com/.default"
                            );

                        if (!token) {
                            throw new Error(
                                "Microsoft Graph no devolvió un access token"
                            );
                        }

                        done(
                            null,
                            token.token
                        );
                    } catch (error) {
                        done(
                            error as Error,
                            null
                        );
                    }
                },
        });

    return graphClient;
}

function destinatarios(
    valor: string
): string[] {
    return valor
        .split(/[,;]/)
        .map((email) => email.trim())
        .filter(Boolean);
}

/** Mensaje legible para guardar en el error del destinatario. */
function errorGraph(
    error: unknown
): Error {
    const e =
        error as {
            statusCode?: number;
            code?: string;
            message?: string;
        };

    return new Error(
        `Microsoft Graph${e.statusCode ? ` ${e.statusCode}` : ""}${e.code ? ` ${e.code}` : ""}: ${e.message ?? "error desconocido"}`
    );
}

async function enviarPorGraph({
    to,
    subject,
    bodyHtml,
    attachments = [],
    replyTo,
}: SendEmailInput): Promise<SendEmailResult> {
    if (!GRAPH_MAILER_USER) {
        throw new Error(
            "No hay buzón remitente para Graph (GRAPH_MAILER_USER o EMAIL_USER)"
        );
    }

    const para =
        destinatarios(to);

    if (para.length === 0) {
        throw new Error(
            "No hay destinatarios válidos"
        );
    }

    const tamano =
        bodyHtml.length +
        attachments.reduce(
            (total, a) =>
                total +
                a.contentBytes.length,
            0
        );

    if (tamano > LIMITE_GRAPH_BYTES) {
        throw new Error(
            `El correo pesa ~${(tamano / 1024 / 1024).toFixed(1)} MB: Microsoft Graph acepta hasta 3 MB por envío. Reduce los adjuntos o las imágenes.`
        );
    }

    try {
        await getGraphClient()
            .api(
                `/users/${encodeURIComponent(GRAPH_MAILER_USER)}/sendMail`
            )
            .post({
                message: {
                    subject,

                    body: {
                        contentType:
                            "HTML",

                        content:
                            bodyHtml,
                    },

                    toRecipients:
                        para.map(
                            (address) => ({
                                emailAddress: {
                                    address,
                                },
                            })
                        ),

                    ...(replyTo
                        ? {
                            replyTo: [
                                {
                                    emailAddress: {
                                        address:
                                            replyTo,
                                    },
                                },
                            ],
                        }
                        : {}),

                    attachments:
                        attachments.map(
                            (a) => ({
                                "@odata.type":
                                    "#microsoft.graph.fileAttachment",

                                name:
                                    a.name,

                                contentType:
                                    a.contentType,

                                contentBytes:
                                    a.contentBytes,

                                ...(a.isInline &&
                                    a.contentId
                                    ? {
                                        isInline:
                                            true,

                                        contentId:
                                            a.contentId,
                                    }
                                    : {}),
                            })
                        ),
                },

                /*
                 * Queda copia en "Elementos enviados" del buzón:
                 * evidencia del envío de cada campaña.
                 */
                saveToSentItems:
                    true,
            });
    } catch (error) {
        throw errorGraph(error);
    }

    return {
        proveedor:
            "graph",

        messageId:
            null,

        accepted:
            para,

        rejected:
            [],
    };
}

/* =========================================================
   SMTP (anterior)
   ========================================================= */

async function enviarPorSmtp({
    to,
    subject,
    bodyHtml,
    attachments = [],
    replyTo,
}: SendEmailInput): Promise<SendEmailResult> {
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
        proveedor:
            "smtp",

        messageId:
            info.messageId ?? null,

        accepted:
            (info.accepted ?? []).map(String),

        rejected:
            (info.rejected ?? []).map(String),
    };
}

/* =========================================================
   API PÚBLICA
   ========================================================= */

export async function sendEmail(
    input: SendEmailInput
): Promise<SendEmailResult> {
    return PROVEEDOR === "graph"
        ? enviarPorGraph(input)
        : enviarPorSmtp(input);
}