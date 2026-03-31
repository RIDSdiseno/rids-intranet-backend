export type TicketFD = {
    id: number | string;
    status: number;
    priority: number;
    type?: string | null;
    subject: string;
    requester_id?: number | string | null;
    email?: string | null;
    requester?: {
        id?: number | string;
        email?: string | null;
        name?: string | null;
        phone?: string | null;
        company_id?: number | string | null;
    } | null;
    company_id?: number | string | null;
    created_at: string;
    updated_at: string;
    source?: number | string | null;
};
export declare function upsertTicketBatch(tickets: TicketFD[]): Promise<void>;
//# sourceMappingURL=upsert.d.ts.map