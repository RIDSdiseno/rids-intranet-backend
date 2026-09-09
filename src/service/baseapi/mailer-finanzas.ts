// src/lib/mailer-finanzas.ts

import dns from "node:dns";
import nodemailer from "nodemailer";

/*
 * Railway puede resolver el SMTP primero por IPv6.
 * Priorizamos IPv4 para evitar ENETUNREACH
 * cuando el contenedor no tiene salida IPv6.
 */
dns.setDefaultResultOrder(
    "ipv4first"
);

const SMTP_HOST =
    process.env.SMTP_HOST?.trim();

const SMTP_PORT =
    Number(
        process.env.SMTP_PORT ||
        587
    );

const SMTP_FINANZAS_USER =
    process.env.SMTP_FINANZAS_USER?.trim();

const SMTP_FINANZAS_PASSWORD =
    process.env.SMTP_FINANZAS_PASSWORD;

if (
    !SMTP_HOST ||
    !SMTP_FINANZAS_USER ||
    !SMTP_FINANZAS_PASSWORD
) {
    console.warn(
        "⚠️ Configuración SMTP FINANZAS incompleta:",
        {
            SMTP_HOST:
                SMTP_HOST ||
                "NO DEFINIDO",

            SMTP_PORT,

            SMTP_FINANZAS_USER:
                SMTP_FINANZAS_USER ||
                "NO DEFINIDO",

            SMTP_FINANZAS_PASSWORD:
                SMTP_FINANZAS_PASSWORD
                    ? "DEFINIDO"
                    : "NO DEFINIDO",
        }
    );
}

export const transporterFinanzas =
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
                SMTP_FINANZAS_USER,

            pass:
                SMTP_FINANZAS_PASSWORD,
        },

        connectionTimeout:
            30_000,

        greetingTimeout:
            30_000,

        socketTimeout:
            60_000,

        dnsTimeout:
            30_000,

        tls: {
            rejectUnauthorized:
                false,
        },
    });