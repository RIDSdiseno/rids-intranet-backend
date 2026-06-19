import { prisma } from "../lib/prisma.js";
import { canViewMapaTecnicos } from "../policies/canViewMapaTecnicos.js";
function getDireccionDesdeJson(value) {
    if (!value)
        return null;
    if (typeof value === "string") {
        return value.trim() || null;
    }
    if (Array.isArray(value)) {
        const direcciones = value
            .filter((item) => !!item && typeof item === "object")
            .map((item) => ({
            direccion: typeof item.direccion === "string" ? item.direccion.trim() : "",
            principal: Boolean(item.principal),
        }))
            .filter((item) => item.direccion);
        return (direcciones.find((item) => item.principal)?.direccion ??
            direcciones[0]?.direccion ??
            null);
    }
    if (typeof value === "object") {
        const item = value;
        return typeof item.direccion === "string" && item.direccion.trim()
            ? item.direccion.trim()
            : null;
    }
    return null;
}
export async function listarUltimasUbicacionesTecnicos(req, res) {
    try {
        if (!canViewMapaTecnicos(req.user)) {
            return res.status(403).json({
                message: "No tienes permisos para ver el mapa de técnicos",
            });
        }
        const ultimasPorTecnico = await prisma.ubicacionTecnico.groupBy({
            by: ["tecnicoId"],
            _max: {
                createdAt: true,
            },
        });
        const filtrosUltimas = ultimasPorTecnico
            .filter((item) => item._max.createdAt)
            .map((item) => ({
            tecnicoId: item.tecnicoId,
            createdAt: item._max.createdAt,
        }));
        if (filtrosUltimas.length === 0) {
            return res.json([]);
        }
        const ubicaciones = await prisma.ubicacionTecnico.findMany({
            where: {
                OR: filtrosUltimas,
            },
            orderBy: {
                createdAt: "desc",
            },
        });
        const ubicacionesUnicas = Array.from(ubicaciones
            .reduce((acc, ubicacion) => {
            if (!acc.has(ubicacion.tecnicoId)) {
                acc.set(ubicacion.tecnicoId, ubicacion);
            }
            return acc;
        }, new Map())
            .values());
        const tecnicoIds = ubicacionesUnicas.map((ubicacion) => ubicacion.tecnicoId);
        const agendaIds = ubicacionesUnicas
            .map((ubicacion) => ubicacion.agendaId)
            .filter((agendaId) => typeof agendaId === "number");
        const tecnicosPromise = prisma.tecnico.findMany({
            where: {
                id_tecnico: {
                    in: tecnicoIds,
                },
            },
            select: {
                id_tecnico: true,
                nombre: true,
                email: true,
                rol: true,
                status: true,
            },
        });
        const agendasPromise = agendaIds.length
            ? prisma.agendaVisita.findMany({
                where: {
                    id: {
                        in: agendaIds,
                    },
                },
                select: {
                    id: true,
                    fecha: true,
                    horaInicio: true,
                    estado: true,
                    empresaExternaNombre: true,
                    notas: true,
                    mensaje: true,
                    empresa: {
                        select: {
                            nombre: true,
                            detalleEmpresa: {
                                select: {
                                    direccion: true,
                                    direcciones: true,
                                },
                            },
                        },
                    },
                },
            })
            : Promise.resolve([]);
        const [tecnicos, agendas] = await Promise.all([tecnicosPromise, agendasPromise]);
        const tecnicosPorId = new Map(tecnicos.map((tecnico) => [tecnico.id_tecnico, tecnico]));
        const agendasPorId = new Map(agendas.map((agenda) => [agenda.id, agenda]));
        const respuesta = ubicacionesUnicas.map((ubicacion) => {
            const tecnico = tecnicosPorId.get(ubicacion.tecnicoId);
            const agenda = ubicacion.agendaId ? agendasPorId.get(ubicacion.agendaId) : null;
            const detalleEmpresa = agenda?.empresa?.detalleEmpresa;
            return {
                tecnicoId: ubicacion.tecnicoId,
                tecnicoNombre: tecnico?.nombre ?? `Tecnico #${ubicacion.tecnicoId}`,
                tecnicoEmail: tecnico?.email ?? null,
                agendaId: ubicacion.agendaId,
                empresa: agenda?.empresa?.nombre ?? agenda?.empresaExternaNombre ?? null,
                direccion: detalleEmpresa?.direccion ??
                    getDireccionDesdeJson(detalleEmpresa?.direcciones) ??
                    null,
                fechaProgramada: agenda?.fecha ?? null,
                horaProgramada: agenda?.horaInicio ?? null,
                estadoAgenda: agenda?.estado ?? null,
                latitud: ubicacion.latitud,
                longitud: ubicacion.longitud,
                precision: ubicacion.precision,
                velocidad: ubicacion.velocidad,
                estadoTracking: ubicacion.estadoTracking,
                createdAt: ubicacion.createdAt,
            };
        });
        return res.json(respuesta);
    }
    catch (error) {
        console.error("Error al listar ubicaciones de tecnicos:", error);
        return res.status(500).json({
            ok: false,
            message: "Error al obtener ubicaciones de tecnicos",
        });
    }
}
//# sourceMappingURL=ubicaciones.controller.js.map