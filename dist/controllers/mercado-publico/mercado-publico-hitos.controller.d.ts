import type { Request, Response } from "express";
/** GET /mercado-publico/:id/hitos */
export declare function listarHitosController(req: Request, res: Response): Promise<Response<any, Record<string, any>>>;
/** POST /mercado-publico/:id/hitos/sincronizar */
export declare function sincronizarHitosController(req: Request, res: Response): Promise<Response<any, Record<string, any>>>;
/**
 * POST /mercado-publico/avisos/procesar
 * Por defecto SIMULA (no envía ni registra): devuelve qué se enviaría.
 * Con ?enviar=1 envía y registra (mismo proceso del cron, sin sincronizar).
 */
export declare function procesarAvisosController(req: Request, res: Response): Promise<Response<any, Record<string, any>>>;
/** POST /mercado-publico/hitos/sincronizar-vigentes (lo usará también el cron) */
export declare function sincronizarHitosVigentesController(_req: Request, res: Response): Promise<Response<any, Record<string, any>>>;
//# sourceMappingURL=mercado-publico-hitos.controller.d.ts.map