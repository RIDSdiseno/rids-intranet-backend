import type { Request, Response } from "express";
export declare function getCotizaciones(_req: Request, res: Response): Promise<void>;
export declare function getCotizacionById(req: Request, res: Response): Promise<Response<any, Record<string, any>>>;
export declare function createCotizacion(req: Request, res: Response): Promise<Response<any, Record<string, any>>>;
export declare function updateCotizacion(req: Request, res: Response): Promise<Response<any, Record<string, any>>>;
export declare function deleteCotizacion(req: Request, res: Response): Promise<void>;
//# sourceMappingURL=cotizaciones.controller.d.ts.map