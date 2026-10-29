// src/service/proteccion-datos/proteccion-datos-documento.service.ts
import { createHash, } from "crypto";
/* =========================================================
   NORMALIZACIÓN
   ========================================================= */
/**
 * Normaliza el HTML antes de calcular el hash.
 *
 * IMPORTANTE:
 * esta función NO reemplaza la sanitización HTML.
 *
 * Primero debe sanitizarse el documento.
 * Después se normaliza.
 * Finalmente se calcula el hash.
 */
export function normalizarDocumentoHtml(html) {
    if (typeof html !== "string") {
        throw new Error("El contenido del documento debe ser texto");
    }
    return html
        .replace(/\r\n/g, "\n")
        .replace(/\r/g, "\n")
        .trim();
}
/* =========================================================
   HASH DOCUMENTAL
   ========================================================= */
export function hashDocumento(contenidoHtml) {
    const contenidoNormalizado = normalizarDocumentoHtml(contenidoHtml);
    return createHash("sha256")
        .update(contenidoNormalizado, "utf8")
        .digest("hex");
}
//# sourceMappingURL=proteccion-datos-documento.service.js.map