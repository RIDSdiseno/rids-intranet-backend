import type { Request, Response } from "express";
export declare const listMantencionesRemotas: (req: Request, res: Response) => Promise<Response<any, Record<string, any>>>;
export declare const exportMantencionesRemotas: (req: Request, res: Response) => Promise<Response<any, Record<string, any>>>;
export declare const getMantencionRemotaById: (req: Request, res: Response) => Promise<Response<any, Record<string, any>>>;
export declare const createMantencionRemota: (req: Request, res: Response) => Promise<Response<any, Record<string, any>>>;
export declare const updateMantencionRemota: (req: Request, res: Response) => Promise<Response<any, Record<string, any>>>;
export declare const deleteMantencionRemota: (req: Request, res: Response) => Promise<Response<any, Record<string, any>>>;
export declare const closeMantencionRemota: (req: Request, res: Response) => Promise<Response<any, Record<string, any>>>;
export declare const mantencionesRemotasMetrics: (req: Request, res: Response) => Promise<Response<any, Record<string, any>>>;
export declare const getMantencionesRemotasFilters: (req: Request, res: Response) => Promise<Response<any, Record<string, any>>>;
//# sourceMappingURL=mantencionesRemotas.controller.d.ts.map