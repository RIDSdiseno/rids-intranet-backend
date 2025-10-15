import type { Request, Response } from "express";
/** GET /equipos  -> lista general para tabla */
export declare function listEquipos(req: Request, res: Response): Promise<Response<any, Record<string, any>>>;
export declare function createEquipo(req: Request, res: Response): Promise<Response<any, Record<string, any>>>;
export declare function getEquipoById(req: Request, res: Response): Promise<Response<any, Record<string, any>>>;
export declare function updateEquipo(req: Request, res: Response): Promise<Response<any, Record<string, any>>>;
export declare function deleteEquipo(req: Request, res: Response): Promise<Response<any, Record<string, any>>>;
//# sourceMappingURL=equipos.controller.d.ts.map