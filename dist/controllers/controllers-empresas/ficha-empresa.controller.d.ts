import type { Request, Response } from "express";
export declare function obtenerFichaEmpresa(req: Request, res: Response): Promise<void>;
export declare function obtenerFichaEmpresaCompleta(req: Request, res: Response): Promise<Response<any, Record<string, any>>>;
export declare function actualizarFichaEmpresa(req: Request, res: Response): Promise<Response<any, Record<string, any>>>;
export declare function obtenerFichaTecnicaEmpresa(req: Request, res: Response): Promise<Response<any, Record<string, any>>>;
export declare function upsertFichaTecnicaEmpresa(req: Request, res: Response): Promise<Response<any, Record<string, any>>>;
export declare function upsertChecklistEmpresa(req: Request, res: Response): Promise<Response<any, Record<string, any>>>;
/**
 * GET /api/ficha-empresa/:empresaId/servidores-config
 */
export declare function obtenerConfiguracionServidores(req: Request, res: Response): Promise<Response<any, Record<string, any>>>;
/**
 * PATCH /api/ficha-empresa/:empresaId/servidores-config
 */
export declare function actualizarConfiguracionServidores(req: Request, res: Response): Promise<Response<any, Record<string, any>>>;
//# sourceMappingURL=ficha-empresa.controller.d.ts.map