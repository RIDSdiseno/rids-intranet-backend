import type { Request, Response } from "express";
export declare function generarMalla(req: Request, res: Response): Promise<Response<any, Record<string, any>>>;
export declare function listarEmpresasAgenda(req: Request, res: Response): Promise<Response<any, Record<string, any>>>;
export declare function getAgenda(req: Request, res: Response): Promise<Response<any, Record<string, any>>>;
export declare function getAgendaDesdeOutlookController(req: Request, res: Response): Promise<Response<any, Record<string, any>>>;
export declare function syncAgendaOutlook(req: Request, res: Response): Promise<Response<any, Record<string, any>>>;
export declare function updateVisita(req: Request, res: Response): Promise<Response<any, Record<string, any>>>;
export declare function eliminarVisita(req: Request, res: Response): Promise<Response<any, Record<string, any>>>;
export declare function eliminarMalla(req: Request, res: Response): Promise<Response<any, Record<string, any>>>;
export declare function crearVisitaManual(req: Request, res: Response): Promise<Response<any, Record<string, any>>>;
export declare function reprogramarTecnicos(req: Request, res: Response): Promise<Response<any, Record<string, any>>>;
export declare function enviarNotaAgenda(req: Request, res: Response): Promise<Response<any, Record<string, any>>>;
//# sourceMappingURL=agenda.controller.d.ts.map