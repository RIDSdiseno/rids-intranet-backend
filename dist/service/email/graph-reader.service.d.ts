import 'isomorphic-fetch';
declare class GraphReaderService {
    private client;
    private supportEmail;
    constructor();
    private getClient;
    readUnreadEmails(): Promise<void>;
    private processMessage;
    private stripHtml;
    private createOrUpdateTicket;
    private findExistingTicket;
    private addMessageToTicket;
    private detectPriority;
}
export declare const graphReaderService: GraphReaderService;
export {};
//# sourceMappingURL=graph-reader.service.d.ts.map