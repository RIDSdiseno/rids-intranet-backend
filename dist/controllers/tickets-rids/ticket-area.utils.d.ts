import { type TicketArea } from "./ticket-area.keywords.js";
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
export declare function parseArea(raw: unknown): TicketArea | undefined;
export declare function normalizeText(input: unknown): string;
export declare function collectTicketText(ticket: TicketTextLike): string;
export declare function detectArea(ticket: TicketTextLike): TicketArea;
export {};
//# sourceMappingURL=ticket-area.utils.d.ts.map