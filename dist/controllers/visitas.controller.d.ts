import type { Request, Response } from "express";
export declare const listVisitas: (req: Request, res: Response) => Promise<Response<any, Record<string, any>>>;
export declare const getVisitaById: (req: Request, res: Response) => Promise<Response<any, Record<string, any>>>;
export declare const createVisita: (req: Request, res: Response) => Promise<Response<any, Record<string, any>>>;
export declare const updateVisita: (req: Request, res: Response) => Promise<Response<any, Record<string, any>>>;
export declare const deleteVisita: (req: Request, res: Response) => Promise<Response<any, Record<string, any>>>;
export declare const getVisitasMetrics: (req: Request, res: Response) => Promise<Response<any, Record<string, any>>>;
export declare const visitasMetrics: (req: Request, res: Response) => Promise<void>;
export declare const getVisitasFilters: (_req: Request, res: Response) => Promise<void>;
export declare const closeVisita: (req: Request, res: Response) => Promise<Response<any, Record<string, any>>>;
//# sourceMappingURL=visitas.controller.d.ts.map