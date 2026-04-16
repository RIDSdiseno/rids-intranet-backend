type TicketSlaAlertEmailParams = {
    to: string;
    tecnicoNombre?: string | null;
    ticketId: number;
    subject: string;
    priority: string;
    status: string;
    alertType: "FIRST_RESPONSE_SOON" | "FIRST_RESPONSE_BREACHED" | "RESOLUTION_SOON" | "RESOLUTION_BREACHED";
    firstResponseRemaining?: number | null;
    resolutionRemaining?: number | null;
};
export declare function sendTicketSlaAlertEmail(params: TicketSlaAlertEmailParams): Promise<void>;
export {};
//# sourceMappingURL=ticket-sla-alert-mailer.d.ts.map