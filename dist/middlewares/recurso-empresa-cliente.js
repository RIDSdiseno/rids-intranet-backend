import { prismaBase } from "../lib/prisma.js";
async function verificarRecurso(req, res, next, valor, cargarEmpresaId) {
    const user = req.user;
    if (!user || user.rol !== "CLIENTE") {
        next();
        return;
    }
    const id = Number(valor);
    if (!Number.isInteger(id) || id <= 0) {
        res.status(400).json({ error: "Identificador inválido" });
        return;
    }
    try {
        const empresaId = await cargarEmpresaId(id);
        if (empresaId !== null && empresaId !== user.empresaId) {
            res.status(403).json({ error: "No tienes acceso a los datos de esta empresa" });
            return;
        }
        next();
    }
    catch (error) {
        next(error);
    }
}
/** Para `router.param("<nombre>", ...)`. */
export function validarRecursoParam(cargarEmpresaId) {
    return (req, res, next, valor) => {
        void verificarRecurso(req, res, next, valor, cargarEmpresaId);
    };
}
/** Para una ruta puntual cuyo parámetro tiene un nombre genérico (p. ej. `:id`). */
export function validarRecursoEnRuta(parametro, cargarEmpresaId) {
    return (req, res, next) => {
        void verificarRecurso(req, res, next, req.params[parametro], cargarEmpresaId);
    };
}
/* ===================== Cargadores ===================== */
export async function empresaIdDeServidor(id) {
    const servidor = await prismaBase.servidor.findUnique({
        where: { id },
        select: { empresaId: true },
    });
    return servidor?.empresaId ?? null;
}
/**
 * Empresa de un equipo: la del equipo o, si no tiene, la de su solicitante.
 * Si el equipo existe pero no tiene empresa, devuelve 0 (no coincide con
 * ningún cliente → 403 para CLIENTE). Si no existe, null (sigue al controller).
 */
export async function empresaIdDeEquipo(id) {
    const equipo = await prismaBase.equipo.findUnique({
        where: { id_equipo: id },
        select: { empresaId: true, solicitante: { select: { empresaId: true } } },
    });
    if (!equipo)
        return null;
    return equipo.empresaId ?? equipo.solicitante?.empresaId ?? 0;
}
export async function empresaIdDeSucursal(id) {
    const sucursal = await prismaBase.sucursal.findUnique({
        where: { id_sucursal: id },
        select: { empresaId: true },
    });
    return sucursal?.empresaId ?? null;
}
//# sourceMappingURL=recurso-empresa-cliente.js.map