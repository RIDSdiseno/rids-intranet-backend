import { AREA_KEYWORDS, type TicketArea } from "./ticket-area.keywords.js";

type TicketTextLike = {
    subject?: string | null;
    fromEmail?: string | null;
    messages?: Array<{
        bodyText?: string | null;
        bodyHtml?: string | null;
        fromEmail?: string | null;
        toEmail?: string | null;
        cc?: string | null;
    }> | null;
};

export function parseArea(raw: unknown): TicketArea | undefined {
    const candidate = Array.isArray(raw) ? raw[0] : raw;
    const area = String(candidate ?? "").trim().toUpperCase();
    if (!area) return undefined;
    if (area === "SOPORTE") return "SOPORTE";
    if (area === "INFORMATICA") return "INFORMATICA";
    if (area === "VENTAS") return "VENTAS";
    return undefined;
}

export function normalizeText(input: unknown): string {
    if (typeof input !== "string") return "";
    return input.toLowerCase().replace(/\s+/g, " ").trim();
}

export function collectTicketText(ticket: TicketTextLike): string {
    const chunks: string[] = [];

    if (ticket.subject) chunks.push(ticket.subject);
    if (ticket.fromEmail) chunks.push(ticket.fromEmail);

    for (const message of ticket.messages ?? []) {
        if (message.bodyText) chunks.push(message.bodyText);
        if (message.bodyHtml) chunks.push(message.bodyHtml);
        if (message.fromEmail) chunks.push(message.fromEmail);
        if (message.toEmail) chunks.push(message.toEmail);
        if (message.cc) chunks.push(message.cc);
    }

    return normalizeText(chunks.join(" "));
}

export function detectArea(ticket: TicketTextLike): TicketArea {
    const text = collectTicketText(ticket);
    if (!text) return "SOPORTE";

    const hasAnyKeyword = (keywords: string[]): boolean =>
        keywords.some((keyword) => text.includes(normalizeText(keyword)));

    if (hasAnyKeyword(AREA_KEYWORDS.INFORMATICA)) return "INFORMATICA";
    if (hasAnyKeyword(AREA_KEYWORDS.VENTAS)) return "VENTAS";

    return "SOPORTE";
}
