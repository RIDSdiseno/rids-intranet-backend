import type { Request, Response } from "express";
export declare function seedEntidadesRIDS(_req: Request, res: Response): Promise<void>;
export declare function seedEntidadesECCONET(_req: Request, res: Response): Promise<void>;
export declare function createEntidad(req: Request, res: Response): Promise<void>;
export declare function getEntidades(req: Request, res: Response): Promise<void>;
export declare function getEntidadById(req: Request, res: Response): Promise<Response<any, Record<string, any>>>;
export declare function updateEntidad(req: Request, res: Response): Promise<void>;
export declare function deleteEntidad(req: Request, res: Response): Promise<void>;
//# sourceMappingURL=entidades.controller.d.ts.map