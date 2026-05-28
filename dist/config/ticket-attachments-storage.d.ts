export declare function uploadTicketAttachmentBuffer(params: {
    ticketId: number;
    messageId: number;
    buffer: Buffer;
    filename: string;
    mimeType?: string | null;
}): Promise<{
    filename: string;
    mimeType: string;
    url: string;
    bytes: number;
}>;
//# sourceMappingURL=ticket-attachments-storage.d.ts.map