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

const SMTP_DEBUG =
    process.env.SMTP_DEBUG ===
    "true";

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

        /* =====================================================
           POOL SMTP
           ===================================================== */

        pool:
            true,

        /*
         * Coincide con la concurrencia inicial
         * utilizada por Protección de Datos.
         */
        maxConnections:
            5,

        /*
         * Número máximo de mensajes que una conexión
         * puede procesar antes de renovarse.
         */
        maxMessages:
            100,

        /* =====================================================
           TIMEOUTS
           ===================================================== */

        connectionTimeout:
            15_000,

        greetingTimeout:
            15_000,

        socketTimeout:
            30_000,

        tls: {
            rejectUnauthorized:
                true,
        },

        /* =====================================================
           DEBUG OPCIONAL
           ===================================================== */

        logger:
            SMTP_DEBUG,

        debug:
            SMTP_DEBUG,
    });

/*
 * Comprobación opcional del SMTP.
 *
 * No envía correos.
 * Solo prueba conexión y autenticación.
 */
export async function verificarSMTP() {

    const inicio =
        Date.now();

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

                duracionMs:
                    Date.now() -
                    inicio,
            }
        );

        return true;

    } catch (
    error
    ) {

        console.error(
            "[SMTP] ❌ No fue posible conectar/autenticar con SMTP",
            {
                host:
                    SMTP_HOST,

                port:
                    SMTP_PORT,

                duracionMs:
                    Date.now() -
                    inicio,

                error,
            }
        );

        return false;
    }
}