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
        to: string | string[];
        cc?: string[];
        subject: string;
        bodyHtml: string;
    }): Promise<void>;
    private toSantiagoDateTime;
    readCalendarEvents(startDateTime: string, endDateTime: string): Promise<Array<{
        id: string;
        subject: string;
        start: string;
        end: string;
        categories: string[];
        body: string;
    }>>;
    createCalendarEvent(params: {
        subject: string;
        bodyHtml?: string;
        startDateTime: string;
        endDateTime: string;
        location?: string;
        categories?: string[];
    }): Promise<any>;
    updateCalendarEvent(eventId: string, params: {
        subject?: string;
        bodyHtml?: string;
        startDateTime?: string;
        endDateTime?: string;
        location?: string;
        categories?: string[];
    }): Promise<any>;
    deleteCalendarEvent(eventId: string): Promise<void>;
}
export declare const graphReaderService: GraphReaderService;
export {};
//# sourceMappingURL=graph-reader.service.d.ts.map