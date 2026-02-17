import type { Request, Response } from "express";
export declare function getCotizacionesPaginadas(req: Request, res: Response): Promise<Response<any, Record<string, any>>>;
export declare function getCotizaciones(req: Request, res: Response): Promise<void>;
export declare function getCotizacionById(req: Request, res: Response): Promise<Response<any, Record<string, any>>>;
export declare function createCotizacion(req: Request, res: Response): Promise<Response<any, Record<string, any>>>;
export declare function updateCotizacion(req: Request, res: Response): Promise<Response<any, Record<string, any>>>;
export declare function deleteCotizacion(req: Request, res: Response): Promise<Response<any, Record<string, any>> | undefined>;
export declare function facturarCotizacion(req: Request, res: Response): Promise<Response<any, Record<string, any>> | undefined>;
export declare function anularFactura(req: Request, res: Response): Promise<Response<any, Record<string, any>> | undefined>;
export declare function pagarFactura(req: Request, res: Response): Promise<Response<any, Record<string, any>> | undefined>;
//# sourceMappingURL=cotizaciones.controller.d.ts.map