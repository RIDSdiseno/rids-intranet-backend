import type { Request, Response } from "express";
/**
 * Listado general (paginado) con filtros por:
 *  - empresaId (opcional)
 *  - q (coincide con nombre de solicitante, nombre de empresa o email)
 */
export declare const listSolicitantes: (req: Request, res: Response) => Promise<Response<any, Record<string, any>>>;
/**
 * Versión mini para selects del modal:
 *  - Requiere empresaId
 *  - Opcional q para filtrar por nombre (insensible a mayúsculas)
 * Devuelve: { items: [{ id, nombre }] }
 */
export declare const listSolicitantesByEmpresa: (req: Request, res: Response) => Promise<Response<any, Record<string, any>>>;
/**
 * (Opcional recomendado) Métricas rápidas para la cabecera y filtros del frontend:
 *  - Acepta empresaId y q (como listSolicitantes)
 *  - Devuelve totales de solicitantes, empresas distintas y equipos
 * GET /solicitantes/metrics
 */
export declare const solicitantesMetrics: (req: Request, res: Response) => Promise<Response<any, Record<string, any>>>;
//# sourceMappingURL=solicitante.controller.d.ts.map