import type { Request, Response } from "express";
export declare function enviarMasivo(req: Request, res: Response): Promise<Response<any, Record<string, any>>>;
export declare function obtenerEstadoEnvioMasivo(req: Request, res: Response): Promise<Response<any, Record<string, any>>>;
export declare function crearPlantilla(req: Request, res: Response): Promise<Response<any, Record<string, any>>>;
export declare function listarPlantillas(req: Request, res: Response): Promise<Response<any, Record<string, any>>>;
export declare function obtenerPlantilla(req: Request, res: Response): Promise<Response<any, Record<string, any>>>;
export declare function eliminarPlantilla(req: Request, res: Response): Promise<Response<any, Record<string, any>>>;
export declare function actualizarPlantilla(req: Request, res: Response): Promise<Response<any, Record<string, any>>>;
export declare function obtenerFirmaRemitente(req: Request, res: Response): Promise<Response<any, Record<string, any>>>;
//# sourceMappingURL=correos-masivos.controller.d.ts.map