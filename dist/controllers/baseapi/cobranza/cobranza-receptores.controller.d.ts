import type { Request, Response } from "express";
export declare function getReceptoresCobranza(req: Request, res: Response): Promise<Response<any, Record<string, any>>>;
export declare function getReceptorCobranzaPorRut(req: Request, res: Response): Promise<Response<any, Record<string, any>>>;
export declare function getReceptorCobranza(req: Request, res: Response): Promise<Response<any, Record<string, any>>>;
export declare function postReceptorCobranza(req: Request, res: Response): Promise<Response<any, Record<string, any>>>;
export declare function patchReceptorCobranza(req: Request, res: Response): Promise<Response<any, Record<string, any>>>;
export declare function postContactoCobranza(req: Request, res: Response): Promise<Response<any, Record<string, any>>>;
export declare function patchContactoCobranza(req: Request, res: Response): Promise<Response<any, Record<string, any>>>;
export declare function deleteContactoCobranza(req: Request, res: Response): Promise<Response<any, Record<string, any>>>;
export declare function deleteReceptorCobranza(req: Request, res: Response): Promise<Response<any, Record<string, any>>>;
export declare function postCopiarContactosFacturacion(req: Request, res: Response): Promise<Response<any, Record<string, any>>>;
//# sourceMappingURL=cobranza-receptores.controller.d.ts.map