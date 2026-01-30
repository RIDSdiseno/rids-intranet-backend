declare class EmailSenderService {
    private transporter;
    constructor();
    /**
     * Envía respuesta del agente al cliente
     */
    sendAgentReply(ticket: {
        id: number;
        subject: string;
        status: string;
    }, message: string, toEmail: string): Promise<void>;
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