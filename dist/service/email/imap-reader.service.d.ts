declare class ImapReaderService {
    private config;
    constructor();
    readUnreadEmails(): Promise<void>;
    private processEmail;
    private createOrUpdateTicket;
    private findExistingTicket;
    private addMessageToTicket;
    private detectPriority;
}
export declare const imapReaderService: ImapReaderService;
export {};
//# sourceMappingURL=imap-reader.service.d.ts.map