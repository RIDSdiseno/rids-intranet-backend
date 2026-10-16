import type { TicketEventType, TicketPriority, TicketStatus } from "@prisma/client";
import { prisma } from "../../lib/prisma.js";
type TicketForSlaArchive = {
    id: number;
    createdAt: Date;
    assigneeId: number | null;
    priority: TicketPriority;
    status: TicketStatus;
    firstResponseAt: Date | null;
    resolvedAt: Date | null;
    closedAt: Date | null;
    lastReopenedAt: Date | null;
    slaCycleNumber: number;
    events: Array<{
        type: TicketEventType;
        oldValue: string | null;
        newValue: string | null;
        createdAt: Date;
    }>;
};
type TicketSlaCycleTransactionClient = Pick<typeof prisma, "ticketSlaCycle">;
export declare function archiveCurrentSlaCycle(tx: TicketSlaCycleTransactionClient, ticket: TicketForSlaArchive): Promise<void>;
export {};
//# sourceMappingURL=ticket-sla-cycle.service.d.ts.map