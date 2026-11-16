import type { Request, Response } from "express";
export declare function obtenerTelefoniaEmpresa(req: Request, res: Response): Promise<Response<any, Record<string, any>>>;
export declare function crearTelefoniaParlante(req: Request, res: Response): Promise<Response<any, Record<string, any>>>;
export declare function actualizarTelefoniaParlante(req: Request, res: Response): Promise<Response<any, Record<string, any>>>;
export declare function eliminarTelefoniaParlante(req: Request, res: Response): Promise<Response<any, Record<string, any>>>;
export declare function crearTelefoniaUsuario(req: Request, res: Response): Promise<Response<any, Record<string, any>>>;
export declare function actualizarTelefoniaUsuario(req: Request, res: Response): Promise<Response<any, Record<string, any>>>;
export declare function eliminarTelefoniaUsuario(req: Request, res: Response): Promise<Response<any, Record<string, any>>>;
/** GET /api/ficha-empresa/:empresaId/telefonia-config */
export declare function obtenerConfiguracionTelefonia(req: Request, res: Response): Promise<Response<any, Record<string, any>>>;
/** PATCH /api/ficha-empresa/:empresaId/telefonia-config  { telefoniaAplica: boolean } */
export declare function actualizarConfiguracionTelefonia(req: Request, res: Response): Promise<Response<any, Record<string, any>>>;
//# sourceMappingURL=telefonia.controller.d.ts.map