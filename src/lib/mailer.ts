// src/lib/mailer.ts
import nodemailer from "nodemailer";

const SMTP_HOST = process.env.SMTP_HOST?.trim();
const SMTP_PORT = Number(process.env.SMTP_PORT || 587);
const SMTP_USER = process.env.SMTP_USER?.trim();
const SMTP_PASSWORD = process.env.SMTP_PASSWORD;

if (!SMTP_HOST || !SMTP_USER || !SMTP_PASSWORD) {
  console.warn("⚠️ Configuración SMTP incompleta:", {
    SMTP_HOST: SMTP_HOST || "NO DEFINIDO",
    SMTP_PORT,
    SMTP_USER: SMTP_USER || "NO DEFINIDO",
    SMTP_PASSWORD: SMTP_PASSWORD ? "DEFINIDO" : "NO DEFINIDO",
  });
}

export const transporter = nodemailer.createTransport({
  host: SMTP_HOST,
  port: SMTP_PORT,
  secure: SMTP_PORT === 465,
  auth: {
    user: SMTP_USER,
    pass: SMTP_PASSWORD,
  },
  tls: {
    rejectUnauthorized: false,
  },
});