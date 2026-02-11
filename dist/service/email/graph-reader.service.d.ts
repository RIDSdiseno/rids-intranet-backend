import { Client } from '@microsoft/microsoft-graph-client';
import 'isomorphic-fetch';
declare class GraphReaderService {
    private client;
    private supportEmail;
    constructor();
    getClient(): Promise<Client>;
    readUnreadEmails(): Promise<void>;
    private saveAttachments;
    private processMessage;
    private fetchAttachmentsMeta;
    private stripHtml;
    private createOrUpdateTicket;
    private findExistingTicket;
    private addMessageToTicket;
    private detectPriority;
    private downloadAttachment;
    sendReplyEmail(params: {
        to: string;
        subject: string;
        bodyHtml: string;
        bodyText?: string;
        inReplyTo?: string;
        references?: string;
    }): Promise<void>;
}
export declare const graphReaderService: GraphReaderService;
export {};
//# sourceMappingURL=graph-reader.service.d.ts.map