import { prisma } from "../../lib/prisma.js";
import { DateTime } from "luxon";
function toNumber(value) {
    const n = Number(value);
    return Number.isFinite(n) && n > 0 ? n : null;
}
function diffMinutes(inicio, fin) {
    if (!inicio || !fin)
        return 0;
    const ms = fin.getTime() - inicio.getTime();
    if (ms <= 0)
        return 0;
    return Math.round(ms / 60000);
}
function getLocalDateKey(date) {
    return new Intl.DateTimeFormat("en-CA", {
        timeZone: "America/Santiago",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
    }).format(date);
}
function calcularMinutosJornadaVisitas(visitas) {
    const intervalosPorDia = new Map();
    for (const visita of visitas) {
        const status = String(visita.status ?? "").toUpperCase();
        if (status && status !== "COMPLETADA") {
            continue;
        }
        if (!visita.inicio || !visita.fin) {
            continue;
        }
        const inicioMs = visita.inicio.getTime();
        const finMs = visita.fin.getTime();
        if (!Number.isFinite(inicioMs) || !Number.isFinite(finMs)) {
            continue;
        }
        if (finMs <= inicioMs) {
            continue;
        }
        const dia = getLocalDateKey(visita.inicio);
        const actual = intervalosPorDia.get(dia) ?? [];
        actual.push({
            inicioMs,
            finMs,
        });
        intervalosPorDia.set(dia, actual);
    }
    let totalMinutos = 0;
    for (const intervalos of intervalosPorDia.values()) {
        const ordenados = [...intervalos].sort((a, b) => a.inicioMs - b.inicioMs);
        const primero = ordenados[0];
        if (!primero) {
            continue;
        }
        let bloqueInicio = primero.inicioMs;
        let bloqueFin = primero.finMs;
        for (let i = 1; i < ordenados.length; i++) {
            const actual = ordenados[i];
            if (!actual) {
                continue;
            }
            if (actual.inicioMs <= bloqueFin) {
                bloqueFin = Math.max(bloqueFin, actual.finMs);
                continue;
            }
            totalMinutos += Math.round((bloqueFin - bloqueInicio) / 60000);
            bloqueInicio = actual.inicioMs;
            bloqueFin = actual.finMs;
        }
        totalMinutos += Math.round((bloqueFin - bloqueInicio) / 60000);
    }
    return {
        totalMinutos,
        diasConVisitas: intervalosPorDia.size,
    };
}
function normalizeMes(value) {
    const n = Number(value);
    if (!Number.isFinite(n) || n < 1 || n > 12) {
        const now = new Date();
        return String(now.getMonth() + 1).padStart(2, "0");
    }
    return String(n).padStart(2, "0");
}
function normalizeAno(value) {
    const n = Number(value);
    if (!Number.isFinite(n) || n < 2000 || n > 2100) {
        return String(new Date().getFullYear());
    }
    return String(n);
}
function buildMonthlyRange(mes, ano) {
    const year = Number(ano);
    const monthIndex = Number(mes) - 1;
    const desde = new Date(year, monthIndex, 1, 0, 0, 0, 0);
    const hasta = new Date(year, monthIndex + 1, 1, 0, 0, 0, 0);
    return {
        desde,
        hasta,
    };
}
function buildMonthlyRangeSantiago(mes, ano) {
    const desde = DateTime.fromObject({
        year: Number(ano),
        month: Number(mes),
        day: 1,
        hour: 0,
        minute: 0,
        second: 0,
        millisecond: 0,
    }, { zone: "America/Santiago" }).toUTC();
    const hasta = desde.plus({ months: 1 });
    return {
        desde: desde.toJSDate(),
        hasta: hasta.toJSDate(),
    };
}
export async function getEmpresaDashboard(req, res) {
    try {
        const empresaId = toNumber(req.params.id);
        if (!empresaId) {
            return res.status(400).json({
                ok: false,
                message: "ID de empresa inválido",
            });
        }
        const mes = normalizeMes(req.query.mes);
        const ano = normalizeAno(req.query.ano);
        const { desde, hasta } = buildMonthlyRangeSantiago(mes, ano);
        const user = req.user;
        const rol = String(user?.rol ?? "").toUpperCase();
        if (rol === "CLIENTE" && Number(user.empresaId) !== empresaId) {
            return res.status(403).json({
                ok: false,
                message: "No tienes permisos para ver esta empresa",
            });
        }
        const empresa = await prisma.empresa.findUnique({
            where: {
                id_empresa: empresaId,
            },
            select: {
                id_empresa: true,
                nombre: true,
            },
        });
        if (!empresa) {
            return res.status(404).json({
                ok: false,
                message: "Empresa no encontrada",
            });
        }
        const [totalSolicitantesActivos, totalEquipos, equiposPorMarcaRaw, equiposEmpresa, ultimosEquipos, visitasMes, mantencionesRemotasMes,] = await Promise.all([
            prisma.solicitante.count({
                where: {
                    empresaId,
                    isActive: true,
                },
            }),
            prisma.equipo.count({
                where: {
                    solicitante: {
                        is: {
                            empresaId,
                        },
                    },
                },
            }),
            prisma.equipo.groupBy({
                by: ["marca"],
                where: {
                    solicitante: {
                        is: {
                            empresaId,
                        },
                    },
                },
                _count: {
                    _all: true,
                },
                orderBy: {
                    _count: {
                        marca: "desc",
                    },
                },
            }),
            prisma.equipo.findMany({
                where: {
                    solicitante: {
                        is: {
                            empresaId,
                            isActive: true,
                        },
                    },
                },
                select: {
                    id_equipo: true,
                    serial: true,
                    marca: true,
                    modelo: true,
                    createdAt: true,
                    updatedAt: true,
                    solicitante: {
                        select: {
                            id_solicitante: true,
                            nombre: true,
                        },
                    },
                },
            }),
            prisma.equipo.findMany({
                where: {
                    solicitante: {
                        is: {
                            empresaId,
                        },
                    },
                },
                orderBy: {
                    updatedAt: "desc",
                },
                take: 8,
                select: {
                    id_equipo: true,
                    serial: true,
                    marca: true,
                    modelo: true,
                    createdAt: true,
                    updatedAt: true,
                    solicitante: {
                        select: {
                            nombre: true,
                        },
                    },
                },
            }),
            prisma.visita.findMany({
                where: {
                    empresaId,
                    inicio: {
                        gte: desde,
                        lt: hasta,
                    },
                },
                select: {
                    id_visita: true,
                    inicio: true,
                    fin: true,
                    status: true,
                    tecnico: {
                        select: {
                            nombre: true,
                        },
                    },
                },
            }),
            prisma.mantencionRemota.findMany({
                where: {
                    empresaId,
                    inicio: {
                        gte: desde,
                        lt: hasta,
                    },
                },
                select: {
                    inicio: true,
                    fin: true,
                    duracionMinutos: true,
                    tecnico: {
                        select: {
                            nombre: true,
                        },
                    },
                },
            }),
        ]);
        const visitasPresencialesMes = visitasMes.filter((visita) => {
            const status = String(visita.status ?? "").toUpperCase();
            return (status === "COMPLETADA" &&
                visita.inicio &&
                visita.fin &&
                visita.fin.getTime() > visita.inicio.getTime());
        });
        const visitasPorDiaMap = new Map();
        for (const visita of visitasPresencialesMes) {
            if (!visita.inicio)
                continue;
            const dia = getLocalDateKey(visita.inicio);
            visitasPorDiaMap.set(dia, (visitasPorDiaMap.get(dia) ?? 0) + 1);
        }
        const visitasPorDia = Array.from(visitasPorDiaMap.entries())
            .map(([dia, total]) => ({
            dia,
            total,
        }))
            .sort((a, b) => a.dia.localeCompare(b.dia));
        const { totalMinutos: minutosVisitas, diasConVisitas: diasConVisitasMes, } = calcularMinutosJornadaVisitas(visitasPresencialesMes);
        const minutosRemotos = mantencionesRemotasMes.reduce((acc, mantencion) => {
            const duracion = Number(mantencion.duracionMinutos ?? 0);
            if (!Number.isFinite(duracion) || duracion <= 0) {
                return acc;
            }
            return acc + duracion;
        }, 0);
        const totalMinutosSoporte = minutosVisitas + minutosRemotos;
        const horasSoporte = Math.round(totalMinutosSoporte / 60);
        const equiposPorMarca = equiposPorMarcaRaw.map((item) => ({
            marca: item.marca || "Sin marca",
            total: item._count._all,
        }));
        const equiposPorSolicitanteMap = new Map();
        for (const equipo of equiposEmpresa) {
            const solicitante = equipo.solicitante?.nombre ?? "Sin solicitante";
            equiposPorSolicitanteMap.set(solicitante, (equiposPorSolicitanteMap.get(solicitante) ?? 0) + 1);
        }
        const solicitantesConMasEquipos = Array.from(equiposPorSolicitanteMap.entries())
            .map(([solicitante, total]) => ({
            solicitante,
            total,
        }))
            .sort((a, b) => b.total - a.total)
            .slice(0, 10);
        const visitasPorTecnicoMap = new Map();
        for (const visita of visitasMes) {
            const tecnico = visita.tecnico?.nombre ?? "Sin técnico";
            visitasPorTecnicoMap.set(tecnico, (visitasPorTecnicoMap.get(tecnico) ?? 0) + 1);
        }
        const diasConVisitasSet = new Set(visitasPresencialesMes
            .filter((visita) => visita.inicio)
            .map((visita) => getLocalDateKey(visita.inicio)));
        const visitasPorTecnico = Array.from(visitasPorTecnicoMap.entries())
            .map(([tecnico, total]) => ({
            tecnico,
            total,
        }))
            .sort((a, b) => b.total - a.total);
        return res.json({
            ok: true,
            data: {
                empresa,
                periodo: {
                    mes,
                    ano,
                    desde,
                    hasta,
                },
                kpis: {
                    totalSolicitantes: totalSolicitantesActivos,
                    totalSolicitantesActivos,
                    totalEquipos,
                    visitasMes: visitasMes.length,
                    visitasPresencialesMes: visitasPresencialesMes.length,
                    diasConVisitasMes,
                    mantencionesRemotasMes: mantencionesRemotasMes.length,
                    minutosVisitas,
                    minutosRemotos,
                    totalMinutosSoporte,
                    horasSoporte,
                },
                charts: {
                    equiposPorMarca,
                    solicitantesConMasEquipos,
                    visitasPorTecnico,
                    visitasPorDia,
                    horasSoporte: [
                        {
                            tipo: "Visitas",
                            minutos: minutosVisitas,
                            horas: Math.round(minutosVisitas / 60),
                        },
                        {
                            tipo: "Soporte remoto",
                            minutos: minutosRemotos,
                            horas: Math.round(minutosRemotos / 60),
                        },
                    ],
                },
                ultimosEquipos: ultimosEquipos.map((equipo) => ({
                    id_equipo: equipo.id_equipo,
                    serial: equipo.serial,
                    marca: equipo.marca,
                    modelo: equipo.modelo,
                    solicitante: equipo.solicitante?.nombre ?? null,
                    createdAt: equipo.createdAt,
                    updatedAt: equipo.updatedAt,
                })),
            },
        });
    }
    catch (error) {
        console.error("getEmpresaDashboard error:", error);
        return res.status(500).json({
            ok: false,
            message: "Error al obtener dashboard de empresa",
        });
    }
}
//# sourceMappingURL=dashboard-empresa.controller.js.map