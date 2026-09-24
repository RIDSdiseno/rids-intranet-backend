// src/service/bitacora/bitacora-permisos.helper.ts
import type {
    Request,
} from "express";

export function obtenerActorBitacora(
    req:
        Request
) {
    const user =
        (
            req as Request & {
                user?: {
                    id?: number;
                    id_tecnico?: number;
                    tecnicoId?: number;
                    userId?: number;
                    rol?: string;
                };
            }
        ).user;

    const tecnicoId =
        Number(
            user?.id_tecnico ??
            user?.tecnicoId ??
            user?.id ??
            user?.userId
        );

    return {
        tecnicoId:
            Number.isInteger(
                tecnicoId
            ) &&
                tecnicoId > 0
                ? tecnicoId
                : null,

        rol:
            user?.rol ??
            null,
    };
}

export function puedeModificarBitacora({
    actorId,
    rol,
    tecnicoResponsableId,
}: {
    actorId:
    number | null;

    rol:
    string | null;

    tecnicoResponsableId:
    number;
}) {
    if (
        !actorId
    ) {
        return false;
    }

    return (
        rol === "ADMIN" ||
        actorId ===
        tecnicoResponsableId
    );
}