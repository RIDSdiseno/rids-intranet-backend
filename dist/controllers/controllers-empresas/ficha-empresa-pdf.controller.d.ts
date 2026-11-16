import type { Request, Response } from "express";
/**
 * GET /api/ficha-empresa/:empresaId/pdf
 *
 * - Internos: ficha completa, con contraseñas y relación comercial.
 * - CLIENTE: solo su empresa (onlyOwnEmpresa), sin contraseñas
 *   ni relación comercial.
 */
export declare function descargarFichaEmpresaPdf(req: Request, res: Response): Promise<Response<any, Record<string, any>>>;
//# sourceMappingURL=ficha-empresa-pdf.controller.d.ts.map