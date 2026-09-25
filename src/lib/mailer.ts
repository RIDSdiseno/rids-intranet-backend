// src/lib/mailer.ts

import nodemailer from "nodemailer";

const SMTP_HOST =
    process.env.SMTP_HOST
        ?.trim();

const SMTP_PORT =
    Number(
        process.env.SMTP_PORT ||
        587
    );

const SMTP_USER =
    process.env.SMTP_USER
        ?.trim();

const SMTP_PASSWORD =
    process.env.SMTP_PASSWORD;

if (
    !SMTP_HOST ||
    !SMTP_USER ||
    !SMTP_PASSWORD
) {
    console.warn(
        "⚠️ Configuración SMTP incompleta:",
        {
            SMTP_HOST:
                SMTP_HOST ||
                "NO DEFINIDO",

            SMTP_PORT,

            SMTP_USER:
                SMTP_USER ||
                "NO DEFINIDO",

            SMTP_PASSWORD:
                SMTP_PASSWORD
                    ? "DEFINIDO"
                    : "NO DEFINIDO",
        }
    );
}

export const transporter =
    nodemailer.createTransport({
        host:
            SMTP_HOST,

        port:
            SMTP_PORT,

        secure:
            SMTP_PORT ===
            465,

        auth: {
            user:
                SMTP_USER,

            pass:
                SMTP_PASSWORD,
        },

        /*
         * Permite mantener conexiones SMTP reutilizables.
         * Es útil porque el CRM puede enviar varios correos
         * consecutivos, especialmente con múltiples revisores.
         */
        pool:
            true,

        maxConnections:
            3,

        maxMessages:
            100,

        /*
         * Evita que una conexión SMTP quede esperando
         * indefinidamente.
         */
        connectionTimeout:
            15_000,

        greetingTimeout:
            15_000,

        socketTimeout:
            60_000,

        /*
         * Para producción es preferible validar
         * correctamente el certificado SMTP.
         */
        tls: {
            rejectUnauthorized:
                true,
        },
    });

/*
 * Comprobación opcional del SMTP.
 *
 * No envía correos; solamente comprueba
 * conexión + autenticación.
 */
export async function verificarSMTP() {
    try {
        await transporter.verify();

        console.log(
            "[SMTP] ✅ Servidor SMTP disponible",
            {
                host:
                    SMTP_HOST,

                port:
                    SMTP_PORT,

                user:
                    SMTP_USER,
            }
        );

        return true;
    } catch (
    error
    ) {
        console.error(
            "[SMTP] ❌ No fue posible conectar/autenticar con SMTP",
            error
        );

        return false;
    }
}