declare class EmailSenderService {
    private transporter;
    sendStatusEmail(ticketId: number, nuevoEstado: string, toEmail: string): Promise<void>;
    constructor();
    /**
     * Envía respuesta del agente al cliente
     */
    sendAgentReply(ticket: {
        id: number;
        subject: string;
        status: string;
    }, message: string, to: string[], cc: string[], files?: Express.Multer.File[]): Promise<void>;
    sendTicketCreatedEmail(to: string, id: string, summary: string): Promise<void>;
    /**
     * Template HTML para respuesta
     */
    private buildReplyTemplate;
    private escapeHtml;
    private translateStatus;
}
export declare const emailSenderService: EmailSenderService;
export {};
//# sourceMappingURL=email-sender.service.d.ts.map