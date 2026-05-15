// src/controllers/controllers-empresas/dashboard-empresa.controller.ts
import type { Request, Response } from "express";
import { prisma } from "../../lib/prisma.js";

import { DateTime } from "luxon";

function toNumber(value: unknown): number | null {
    const n = Number(value);
    return Number.isFinite(n) && n > 0 ? n : null;
}

function diffMinutes(inicio?: Date | null, fin?: Date | null): number {
    if (!inicio || !fin) return 0;

    const ms = fin.getTime() - inicio.getTime();

    if (ms <= 0) return 0;

    return Math.round(ms / 60000);
}

function normalizeMes(value: unknown): string {
    const n = Number(value);

    if (!Number.isFinite(n) || n < 1 || n > 12) {
        const now = new Date();
        return String(now.getMonth() + 1).padStart(2, "0");
    }

    return String(n).padStart(2, "0");
}

function normalizeAno(value: unknown): string {
    const n = Number(value);

    if (!Number.isFinite(n) || n < 2000 || n > 2100) {
        return String(new Date().getFullYear());
    }

    return String(n);
}

function buildMonthlyRange(mes: string, ano: string) {
    const year = Number(ano);
    const monthIndex = Number(mes) - 1;

    const desde = new Date(year, monthIndex, 1, 0, 0, 0, 0);
    const hasta = new Date(year, monthIndex + 1, 1, 0, 0, 0, 0);

    return {
        desde,
        hasta,
    };
}

function buildMonthlyRangeSantiago(mes: string, ano: string) {
    const desde = DateTime.fromObject(
        {
            year: Number(ano),
            month: Number(mes),
            day: 1,
            hour: 0,
            minute: 0,
            second: 0,
            millisecond: 0,
        },
        { zone: "America/Santiago" }
    ).toUTC();

    const hasta = desde.plus({ months: 1 });

    return {
        desde: desde.toJSDate(),
        hasta: hasta.toJSDate(),
    };
}

export async function getEmpresaDashboard(req: Request, res: Response) {
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

        const user = req.user as {
            id?: number;
            rol?: string;
            empresaId?: number | null;
        };

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

        const [
            totalSolicitantes,
            totalEquipos,
            equiposPorMarcaRaw,
            equiposEmpresa,
            ultimosEquipos,
            visitasMes,
            mantencionesRemotasMes,
        ] = await Promise.all([
            prisma.solicitante.count({
                where: {
                    empresaId,
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

        const minutosVisitas = visitasMes.reduce((acc, visita) => {
            return acc + diffMinutes(visita.inicio, visita.fin);
        }, 0);

        const minutosRemotos = mantencionesRemotasMes.reduce((acc, mantencion) => {
            const duracion = Number(mantencion.duracionMinutos ?? 0);

            if (Number.isFinite(duracion) && duracion > 0) {
                return acc + duracion;
            }

            return acc + diffMinutes(mantencion.inicio, mantencion.fin);
        }, 0);

        const totalMinutosSoporte = minutosVisitas + minutosRemotos;
        const horasSoporte = Number((totalMinutosSoporte / 60).toFixed(2));

        const equiposPorMarca = equiposPorMarcaRaw.map((item) => ({
            marca: item.marca || "Sin marca",
            total: item._count._all,
        }));

        const equiposPorSolicitanteMap = new Map<string, number>();

        for (const equipo of equiposEmpresa) {
            const solicitante = equipo.solicitante?.nombre ?? "Sin solicitante";

            equiposPorSolicitanteMap.set(
                solicitante,
                (equiposPorSolicitanteMap.get(solicitante) ?? 0) + 1
            );
        }

        const solicitantesConMasEquipos = Array.from(
            equiposPorSolicitanteMap.entries()
        )
            .map(([solicitante, total]) => ({
                solicitante,
                total,
            }))
            .sort((a, b) => b.total - a.total)
            .slice(0, 10);

        const visitasPorTecnicoMap = new Map<string, number>();

        for (const visita of visitasMes) {
            const tecnico = visita.tecnico?.nombre ?? "Sin técnico";

            visitasPorTecnicoMap.set(
                tecnico,
                (visitasPorTecnicoMap.get(tecnico) ?? 0) + 1
            );
        }

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
                    totalSolicitantes,
                    totalEquipos,

                    visitasMes: visitasMes.length,
                    mantencionesRemotasMes: mantencionesRemotasMes.length,

                    totalMinutosSoporte,
                    horasSoporte,
                },

                charts: {
                    equiposPorMarca,

                    solicitantesConMasEquipos,

                    visitasPorTecnico,

                    horasSoporte: [
                        {
                            tipo: "Visitas",
                            minutos: minutosVisitas,
                            horas: Number((minutosVisitas / 60).toFixed(2)),
                        },
                        {
                            tipo: "Soporte remoto",
                            minutos: minutosRemotos,
                            horas: Number((minutosRemotos / 60).toFixed(2)),
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
    } catch (error) {
        console.error("getEmpresaDashboard error:", error);

        return res.status(500).json({
            ok: false,
            message: "Error al obtener dashboard de empresa",
        });
    }
}