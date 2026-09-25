import type { Request } from "express";
export declare function obtenerActorBitacora(req: Request): {
    tecnicoId: number | null;
    rol: string | null;
};
export declare function puedeModificarBitacora({ actorId, rol, tecnicoResponsableId, }: {
    actorId: number | null;
    rol: string | null;
    tecnicoResponsableId: number;
}): boolean;
//# sourceMappingURL=bitacora-permisos.helper.d.ts.map