import type { Request, Response } from "express";
export declare function getCotizacionesPaginadas(req: Request, res: Response): Promise<Response<any, Record<string, any>>>;
export declare function getCotizaciones(req: Request, res: Response): Promise<void>;
export declare function getCotizacionById(req: Request, res: Response): Promise<Response<any, Record<string, any>>>;
export declare function createCotizacion(req: Request, res: Response): Promise<Response<any, Record<string, any>>>;
export declare function updateCotizacion(req: Request, res: Response): Promise<Response<any, Record<string, any>>>;
export declare function deleteCotizacion(req: Request, res: Response): Promise<Response<any, Record<string, any>> | undefined>;
export declare function vincularEquipoAItem(req: Request, res: Response): Promise<Response<any, Record<string, any>>>;
export declare function facturarCotizacion(req: Request, res: Response): Promise<Response<any, Record<string, any>> | undefined>;
export declare function anularFactura(req: Request, res: Response): Promise<Response<any, Record<string, any>> | undefined>;
export declare function pagarFactura(req: Request, res: Response): Promise<Response<any, Record<string, any>> | undefined>;
export declare function cambiarEstadoFactura(req: Request, res: Response): Promise<void>;
export declare function emitirFacturaSII(req: Request, res: Response): Promise<Response<any, Record<string, any>>>;
export declare function consultarEnvioSII(req: Request, res: Response): Promise<Response<any, Record<string, any>>>;
export declare function vincularFacturaSII(req: Request, res: Response): Promise<Response<any, Record<string, any>>>;
export declare function consultarEstadoSII(req: Request, res: Response): Promise<Response<any, Record<string, any>>>;
//# sourceMappingURL=cotizaciones.controller.d.ts.map