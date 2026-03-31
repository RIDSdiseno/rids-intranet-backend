import type { Request, Response, NextFunction } from "express";
/**
 * POST /api/solicitantes/cleanup/no-cuenta
 * body: { empresaId?: number, mode?: "deactivate" | "purge" }
 *
 * - Si empresaId viene: limpia esa empresa (salvo excepciones)
 * - Si NO viene: limpia todas (iterando empresas, saltando excepciones)
 */
export declare function cleanupSolicitantesNoCuenta(req: Request, res: Response, next: NextFunction): Promise<void>;
//# sourceMappingURL=solicitantesMaintenance.controller.d.ts.map