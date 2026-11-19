// src/service/baseapi/email-logo-empresa.ts
//
// Logo de la empresa emisora (RIDS / ECONNET) en los correos de facturas, cobranza y conciliación.
//
// - Va como imagen INLINE (adjunto con contentId) y el HTML la referencia con src="cid:...".
//   Gmail y Outlook bloquean las imágenes en base64 (data:) dentro del HTML; las inline sí se muestran
//   sin que el cliente tenga que «descargar imágenes».
// - Usa los mismos archivos que el PDF de los DTE: assets/pdf-logos/<empresa>.png.
// - Si el archivo no existe, el correo sale igual, sin logo.
import fs from "node:fs";
import path from "node:path";
export const CID_LOGO_EMPRESA = "logo-empresa";
const cache = new Map();
function leerLogo(empresaKey) {
    const key = String(empresaKey ?? "").trim().toLowerCase();
    if (cache.has(key))
        return cache.get(key) ?? null;
    let buffer = null;
    try {
        const ruta = path.join(process.cwd(), "assets", "pdf-logos", `${key}.png`);
        if (fs.existsSync(ruta))
            buffer = fs.readFileSync(ruta);
        else
            console.warn("[EMAIL LOGO] No existe el logo de la empresa", { empresa: key, ruta });
    }
    catch (error) {
        console.warn("[EMAIL LOGO] No se pudo leer el logo", { empresa: key, error: error instanceof Error ? error.message : error });
    }
    cache.set(key, buffer);
    return buffer;
}
/** Adjunto inline del logo (o null si no hay archivo). */
export function adjuntoLogoEmpresa(empresaKey) {
    const buffer = leerLogo(empresaKey);
    if (!buffer)
        return null;
    return {
        name: `logo-${String(empresaKey).toLowerCase()}.png`,
        contentType: "image/png",
        contentBytes: buffer.toString("base64"),
        isInline: true,
        contentId: CID_LOGO_EMPRESA,
    };
}
/** <img> del logo para la cabecera del correo (vacío si no hay archivo). */
export function htmlLogoEmpresa(empresaKey, alt, alto = 52) {
    if (!leerLogo(empresaKey))
        return "";
    const altSeguro = String(alt ?? "")
        .replace(/&/g, "&amp;")
        .replace(/"/g, "&quot;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;");
    return `<img src="cid:${CID_LOGO_EMPRESA}" alt="${altSeguro}" height="${alto}" style="display:block; height:${alto}px; width:auto; max-width:200px; border:0; outline:none; text-decoration:none; margin:0 0 0 auto;" />`;
}
//# sourceMappingURL=email-logo-empresa.js.map