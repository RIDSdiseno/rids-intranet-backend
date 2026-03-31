// src/config/env.ts
import "dotenv/config";
function required(name, value) {
    if (!value || value.trim() === "") {
        throw new Error(`Missing required env var: ${name}`);
    }
    return value;
}
// Normaliza lista (puedes pasar coma-separado)
function parseOrigins(v) {
    const raw = (v ?? "http://localhost:5173").split(",");
    return raw
        .map(s => s.trim())
        .filter(Boolean)
        .map(s => (s.startsWith("http://") || s.startsWith("https://") ? s : `https://${s}`));
}
export const env = {
    NODE_ENV: process.env.NODE_ENV ?? "development",
    PORT: Number(process.env.PORT ?? 4000),
    // IMPORTANTE: incluye protocolo (https://)
    CORS_ORIGIN: parseOrigins(process.env.CORS_ORIGIN),
    // JWT
    JWT_SECRET: required("JWT_SECRET", process.env.JWT_SECRET),
    JWT_EXPIRES_IN: process.env.JWT_EXPIRES_IN ?? "1d",
    // DB
    DATABASE_URL: required("DATABASE_URL", process.env.DATABASE_URL),
    // Freshdesk (si los usas; si no, déjalos opcionales y NO uses "!")
    FD_DOMAIN: process.env.FD_DOMAIN ?? "",
    FD_API_KEY: process.env.FD_API_KEY ?? "",
    FD_WEBHOOK_SECRET: process.env.FD_WEBHOOK_SECRET ?? "",
};
//# sourceMappingURL=env.js.map