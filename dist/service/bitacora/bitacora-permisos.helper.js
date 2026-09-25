export function obtenerActorBitacora(req) {
    const user = req.user;
    const tecnicoId = Number(user?.id_tecnico ??
        user?.tecnicoId ??
        user?.id ??
        user?.userId);
    return {
        tecnicoId: Number.isInteger(tecnicoId) &&
            tecnicoId > 0
            ? tecnicoId
            : null,
        rol: user?.rol ??
            null,
    };
}
export function puedeModificarBitacora({ actorId, rol, tecnicoResponsableId, }) {
    if (!actorId) {
        return false;
    }
    return (rol === "ADMIN" ||
        actorId ===
            tecnicoResponsableId);
}
//# sourceMappingURL=bitacora-permisos.helper.js.map