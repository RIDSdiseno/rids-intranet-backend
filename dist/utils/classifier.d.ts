export type TicketArea = "SOPORTE" | "INFORMATICA" | "VENTAS" | "ADMIN";
export declare const AREA_KEYWORDS: Record<TicketArea, string[]>;
export declare function classifyTicket(text: string): TicketArea;
//# sourceMappingURL=classifier.d.ts.map