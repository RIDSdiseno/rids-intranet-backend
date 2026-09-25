export interface WhatsappTicketInput {
    email: string;
    company: string;
    subject: string;
    description: string;
    transcript: Array<{
        from: "client" | "bot";
        text: string;
    }>;
    phone?: string;
    name?: string;
}
export interface WhatsappTicketResult {
    ok: boolean;
    ticketId?: number;
    error?: string;
}
export declare function searchEmpresaByName(query: string, email?: string): Promise<Array<{
    id: number;
    nombre: string;
}>>;
export declare function createTicketFromWhatsapp(input: WhatsappTicketInput): Promise<WhatsappTicketResult>;
//# sourceMappingURL=whatchimp-ticket.service.d.ts.map