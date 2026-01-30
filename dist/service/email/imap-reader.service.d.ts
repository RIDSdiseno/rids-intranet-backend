declare class ImapReaderService {
    private config;
    private imap;
    constructor();
    /**
     * Lee emails no leídos del buzón
     */
    readUnreadEmails(): Promise<void>;
    private openInbox;
    private fetchUnreadMessages;
    private processMessage;
    /**
     * Crea ticket nuevo o agrega mensaje a uno existente
     */
    private createOrUpdateTicket;
    /**
     * Busca un ticket existente relacionado con el email
     */
    private findExistingTicket;
    /**
     * Agrega mensaje a un ticket existente
     */
    private addMessageToTicket;
    /**
     * Detecta prioridad automáticamente por palabras clave
     */
    private detectPriority;
}
export declare const imapReaderService: ImapReaderService;
export {};
//# sourceMappingURL=imap-reader.service.d.ts.map