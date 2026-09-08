// src/lib/mailer-finanzas.ts
import nodemailer from "nodemailer";
const SMTP_HOST = process.env.SMTP_HOST?.trim();
const SMTP_PORT = Number(process.env.SMTP_PORT ||
    587);
const SMTP_FINANZAS_USER = process.env.SMTP_FINANZAS_USER?.trim();
const SMTP_FINANZAS_PASSWORD = process.env.SMTP_FINANZAS_PASSWORD;
if (!SMTP_HOST ||
    !SMTP_FINANZAS_USER ||
    !SMTP_FINANZAS_PASSWORD) {
    console.warn("⚠️ Configuración SMTP FINANZAS incompleta:", {
        SMTP_HOST: SMTP_HOST ||
            "NO DEFINIDO",
        SMTP_PORT,
        SMTP_FINANZAS_USER: SMTP_FINANZAS_USER ||
            "NO DEFINIDO",
        SMTP_FINANZAS_PASSWORD: SMTP_FINANZAS_PASSWORD
            ? "DEFINIDO"
            : "NO DEFINIDO",
    });
}
export const transporterFinanzas = nodemailer.createTransport({
    host: SMTP_HOST,
    port: SMTP_PORT,
    secure: SMTP_PORT ===
        465,
    auth: {
        user: SMTP_FINANZAS_USER,
        pass: SMTP_FINANZAS_PASSWORD,
    },
    tls: {
        rejectUnauthorized: false,
    },
});
//# sourceMappingURL=mailer-finanzas.js.map