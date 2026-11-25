import type { Request, Response } from "express";
/** GET /empresas-logo/:empresaId */
export declare function obtenerLogoEmpresaController(req: Request, res: Response): Promise<Response<any, Record<string, any>>>;
/**
 * GET /empresas-logo/:empresaId/png
 * Logo de la empresa en PNG, para incrustarlo en documentos (Word IA).
 * Sin logo → 404 SIN_LOGO (el informe sale solo con el logo de RIDS).
 */
export declare function obtenerLogoEmpresaPngController(req: Request, res: Response): Promise<Response<any, Record<string, any>>>;
/** PUT /empresas-logo/:empresaId (multipart, campo "archivo") */
export declare function subirLogoEmpresaController(req: Request, res: Response): Promise<Response<any, Record<string, any>>>;
/** DELETE /empresas-logo/:empresaId */
export declare function eliminarLogoEmpresaController(req: Request, res: Response): Promise<Response<any, Record<string, any>>>;
//# sourceMappingURL=empresa-logo.controller.d.ts.map