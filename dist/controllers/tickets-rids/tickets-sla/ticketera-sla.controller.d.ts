import type { Request, Response } from "express";
import { TicketPriority, TicketStatus } from "@prisma/client";
export declare function getSlaTargets(priority: TicketPriority | string | null | undefined, slaConfig: Record<string, {
    firstResponseMinutes: number;
    resolutionMinutes: number;
}>): {
    firstResponseMinutes: number;
    resolutionMinutes: number;
};
export declare function buildTicketSla(ticket: {
    createdAt: Date;
    firstResponseAt?: Date | null;
    resolvedAt?: Date | null;
    closedAt?: Date | null;
    status?: TicketStatus | string | null;
    priority?: TicketPriority | string | null;
}, slaConfig: Record<string, {
    firstResponseMinutes: number;
    resolutionMinutes: number;
}>): {
    targets: {
        firstResponseMinutes: number;
        resolutionMinutes: number;
    };
    firstResponse: {
        dueAt: Date;
        at: Date | null;
        elapsedMinutes: number | null;
        status: "PENDING" | "OK" | "BREACHED";
        remainingMinutes: number;
    };
    resolution: {
        dueAt: Date;
        at: Date | null;
        elapsedMinutes: number | null;
        status: "PENDING" | "OK" | "BREACHED";
        remainingMinutes: number;
    };
};
export declare function getTicketSla(req: Request, res: Response): Promise<Response<any, Record<string, any>>>;
//# sourceMappingURL=ticketera-sla.controller.d.ts.map