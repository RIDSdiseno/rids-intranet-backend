import type { Request, Response } from "express";
export declare const register: (req: Request, res: Response) => Promise<Response<any, Record<string, any>>>;
export declare const login: (req: Request, res: Response) => Promise<Response<any, Record<string, any>>>;
export declare const refresh: (req: Request, res: Response) => Promise<Response<any, Record<string, any>>>;
export declare const logout: (_req: Request, res: Response) => Promise<Response<any, Record<string, any>>>;
export declare const me: (req: Request, res: Response) => Promise<Response<any, Record<string, any>>>;
//# sourceMappingURL=auth.controller.d.ts.map