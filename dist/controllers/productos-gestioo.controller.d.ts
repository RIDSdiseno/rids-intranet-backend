import type { Request, Response } from "express";
export declare function seedProductos(_req: Request, res: Response): Promise<void>;
export declare function createProducto(req: Request, res: Response): Promise<Response<any, Record<string, any>>>;
export declare function getProductos(_req: Request, res: Response): Promise<Response<any, Record<string, any>>>;
export declare function getProductoById(req: Request, res: Response): Promise<Response<any, Record<string, any>>>;
export declare function updateProducto(req: Request, res: Response): Promise<Response<any, Record<string, any>>>;
export declare function deleteProducto(req: Request, res: Response): Promise<Response<any, Record<string, any>>>;
//# sourceMappingURL=productos-gestioo.controller.d.ts.map