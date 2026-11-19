import type { Request, Response, NextFunction } from "express";
type UsuarioRequest = Request["user"];
export declare function usuarioPuedeEditarAgenda(user: UsuarioRequest): Promise<boolean>;
export declare function requireAgendaEditor(req: Request, res: Response, next: NextFunction): void;
/** GET /agenda/permisos: el frontend muestra u oculta las acciones de edición. */
export declare function getPermisosAgenda(req: Request, res: Response): Promise<void>;
export {};
//# sourceMappingURL=agenda-editores.d.ts.map