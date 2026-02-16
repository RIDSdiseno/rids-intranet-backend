import type { Request, Response } from "express";
export declare const listSolicitantes: (req: Request, res: Response) => Promise<Response<any, Record<string, any>>>;
export declare const listSolicitantesByEmpresa: (req: Request, res: Response) => Promise<Response<any, Record<string, any>>>;
export declare const listSolicitantesForSelect: (req: Request, res: Response) => Promise<Response<any, Record<string, any>>>;
export declare const solicitantesMetrics: (req: Request, res: Response) => Promise<Response<any, Record<string, any>>>;
export declare const createSolicitante: (req: Request, res: Response) => Promise<Response<any, Record<string, any>>>;
export declare const getSolicitanteById: (req: Request, res: Response) => Promise<Response<any, Record<string, any>>>;
export declare const updateSolicitante: (req: Request, res: Response) => Promise<Response<any, Record<string, any>>>;
export declare const deleteSolicitante: (req: Request, res: Response) => Promise<Response<any, Record<string, any>>>;
//# sourceMappingURL=solicitantes.controller.d.ts.map