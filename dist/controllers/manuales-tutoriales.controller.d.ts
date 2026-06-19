import type { Request, Response } from "express";
import multer from "multer";
export declare const uploadManualTutorialMiddleware: multer.Multer;
export declare function listManualesTutoriales(req: Request, res: Response): Promise<Response<any, Record<string, any>>>;
export declare function getManualTutorialById(req: Request, res: Response): Promise<Response<any, Record<string, any>>>;
export declare function createManualTutorial(req: Request, res: Response): Promise<Response<any, Record<string, any>>>;
export declare function updateManualTutorial(req: Request, res: Response): Promise<Response<any, Record<string, any>>>;
export declare function uploadManualTutorialFile(req: Request, res: Response): Promise<Response<any, Record<string, any>>>;
export declare function deleteManualTutorial(req: Request, res: Response): Promise<Response<any, Record<string, any>>>;
//# sourceMappingURL=manuales-tutoriales.controller.d.ts.map