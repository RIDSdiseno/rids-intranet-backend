import { prismaBase } from "../lib/prisma.js";
export async function usuarioPuedeEditarAgenda(user) {
    if (!user || String(user.rol).toUpperCase() === "CLIENTE") {
        return false;
    }
    /* Solo lectura: cliente sin auditar */
    const tecnico = await prismaBase.tecnico.findUnique({
        where: { id_tecnico: user.id },
        select: { status: true, puedeEditarAgenda: true },
    });
    return Boolean(tecnico?.status && tecnico.puedeEditarAgenda);
}
export function requireAgendaEditor(req, res, next) {
    usuarioPuedeEditarAgenda(req.user)
        .then((puede) => {
        if (!puede) {
            res.status(403).json({
                error: "No tienes permisos para crear, editar o eliminar visitas de la agenda.",
            });
            return;
        }
        next();
    })
        .catch(next);
}
/** GET /agenda/permisos: el frontend muestra u oculta las acciones de edición. */
export async function getPermisosAgenda(req, res) {
    try {
        res.status(200).json({ puedeEditar: await usuarioPuedeEditarAgenda(req.user) });
    }
    catch (error) {
        console.error("Error al obtener permisos de agenda:", error);
        res.status(500).json({ error: "No se pudieron obtener los permisos de agenda" });
    }
}
//# sourceMappingURL=agenda-editores.js.map