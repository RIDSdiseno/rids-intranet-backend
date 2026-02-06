import type { Request, Response } from "express";
declare global {
    namespace Express {
        interface Request {
            user?: {
                id: number;
            };
        }
    }
}
export declare function createTicket(req: Request, res: Response): Promise<Response<any, Record<string, any>>>;
export declare function replyTicketAsAgent(req: Request, res: Response): Promise<Response<any, Record<string, any>>>;
export declare function listTickets(req: Request, res: Response): Promise<Response<any, Record<string, any>>>;
export declare function getTicketById(req: Request, res: Response): Promise<Response<any, Record<string, any>>>;
export declare function updateTicket(req: Request, res: Response): Promise<Response<any, Record<string, any>>>;
export declare function inboundEmail(req: Request, res: Response): Promise<Response<any, Record<string, any>>>;
export declare function downloadTicketAttachment(req: Request, res: Response): Promise<Response<any, Record<string, any>>>;
export declare function getInlineImage(req: Request, res: Response): Promise<Response<any, Record<string, any>>>;
export declare function proxyExternalImage(req: Request, res: Response): Promise<Response<any, Record<string, any>>>;
//# sourceMappingURL=ticketera.controller.d.ts.map