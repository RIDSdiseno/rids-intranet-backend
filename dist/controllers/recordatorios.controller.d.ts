import type { Request, Response } from "express";
export declare function crearRecordatorio(req: Request, res: Response): Promise<Response<any, Record<string, any>>>;
export declare function obtenerMisRecordatorios(req: Request, res: Response): Promise<Response<any, Record<string, any>>>;
export declare function marcarRecordatorioLeido(req: Request, res: Response): Promise<Response<any, Record<string, any>>>;
export declare function completarRecordatorio(req: Request, res: Response): Promise<Response<any, Record<string, any>>>;
export declare function reactivarRecordatorio(req: Request, res: Response): Promise<Response<any, Record<string, any>>>;
export declare function cancelarRecordatorio(req: Request, res: Response): Promise<Response<any, Record<string, any>>>;
export declare function cancelarTodosMisRecordatorios(req: Request, res: Response): Promise<Response<any, Record<string, any>>>;
//# sourceMappingURL=recordatorios.controller.d.ts.map