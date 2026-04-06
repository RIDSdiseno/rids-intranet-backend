import { AREA_KEYWORDS } from "./ticket-area.keywords.js";
export function parseArea(raw) {
    const candidate = Array.isArray(raw) ? raw[0] : raw;
    const area = String(candidate ?? "").trim().toUpperCase();
    if (!area)
        return undefined;
    if (area === "SOPORTE")
        return "SOPORTE";
    if (area === "INFORMATICA")
        return "INFORMATICA";
    if (area === "VENTAS")
        return "VENTAS";
    if (area === "ADMIN")
        return "ADMIN";
    if (area === "OFERTAS")
        return "OFERTAS";
    return undefined;
}
export function normalizeText(input) {
    if (typeof input !== "string")
        return "";
    return input.toLowerCase().replace(/\s+/g, " ").trim();
}
export function collectTicketText(ticket) {
    const chunks = [];
    if (ticket.subject)
        chunks.push(ticket.subject);
    if (ticket.fromEmail)
        chunks.push(ticket.fromEmail);
    for (const message of ticket.messages ?? []) {
        if (message.bodyText)
            chunks.push(message.bodyText);
        if (message.bodyHtml)
            chunks.push(message.bodyHtml);
        if (message.fromEmail)
            chunks.push(message.fromEmail);
        if (message.toEmail)
            chunks.push(message.toEmail);
        if (message.cc)
            chunks.push(message.cc);
    }
    return normalizeText(chunks.join(" "));
}
export function detectArea(ticket) {
    const text = collectTicketText(ticket);
    if (!text)
        return "SOPORTE";
    const hasAnyKeyword = (keywords) => keywords.some((keyword) => text.includes(normalizeText(keyword)));
    if (hasAnyKeyword(AREA_KEYWORDS.INFORMATICA))
        return "INFORMATICA";
    if (hasAnyKeyword(AREA_KEYWORDS.ADMIN))
        return "ADMIN";
    if (hasAnyKeyword(AREA_KEYWORDS.VENTAS))
        return "VENTAS";
    if (hasAnyKeyword(AREA_KEYWORDS.OFERTAS))
        return "OFERTAS";
    return "SOPORTE";
}
//# sourceMappingURL=ticket-area.utils.js.map