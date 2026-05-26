// src/controllers/tecnicos/tecnicos-dashboard.controller.ts
import type { Request, Response } from "express";
import { DateTime } from "luxon";
import { prisma } from "../../lib/prisma.js";

/* ───────────────────────── Helpers de fecha ───────────────────────── */

function toMonthKey(date: Date) {
    return DateTime.fromJSDate(date, { zone: "utc" })
        .setZone("America/Santiago")
        .toFormat("yyyy-MM");
}

function getDefaultRange() {
    const now = DateTime.now().setZone("America/Santiago");

    const desde = now.startOf("month").minus({ months: 5 });
    const hasta = now.startOf("month").plus({ months: 1 });

    return {
        desde: desde.toUTC().toJSDate(),
        hasta: hasta.toUTC().toJSDate(),
    };
}

function parseRange(req: Request) {
    const fromQ = String(req.query.from ?? "").trim();
    const toQ = String(req.query.to ?? "").trim();

    if (!fromQ || !toQ) return getDefaultRange();

    const desde = DateTime.fromISO(fromQ, { zone: "America/Santiago" })
        .startOf("day")
        .toUTC();

    const hasta = DateTime.fromISO(toQ, { zone: "America/Santiago" })
        .startOf("day")
        .toUTC();

    if (!desde.isValid || !hasta.isValid || hasta <= desde) {
        return getDefaultRange();
    }

    return {
        desde: desde.toJSDate(),
        hasta: hasta.toJSDate(),
    };
}

function diffMinutos(inicio: Date | null, fin: Date | null) {
    if (!inicio || !fin) return 0;

    const ini = inicio.getTime();
    const end = fin.getTime();

    if (!Number.isFinite(ini) || !Number.isFinite(end)) return 0;
    if (end <= ini) return 0;

    return Math.round((end - ini) / 60000);
}

/* ───────────────────────── Tipos internos ───────────────────────── */

type MesRow = {
    mes: string;
    minutosVisitas: number;
    minutosRemotas: number;
    tickets: number;
    visitas: number;
    remotas: number;
};

type RowAgg = {
    tecnicoId: number;
    tecnico: string;
    empresaId: number;
    empresa: string;

    minutosVisitas: number;
    minutosRemotas: number;

    visitas: number;
    remotas: number;
    tickets: number;

    meses: Map<string, MesRow>;
};

function ensureMes(row: RowAgg, mes: string) {
    if (!row.meses.has(mes)) {
        row.meses.set(mes, {
            mes,
            minutosVisitas: 0,
            minutosRemotas: 0,
            tickets: 0,
            visitas: 0,
            remotas: 0,
        });
    }

    return row.meses.get(mes)!;
}

/* ───────────────────────── Controller ───────────────────────── */

export const getTecnicosHorasHombreDashboard = async (
    req: Request,
    res: Response
) => {
    try {
        const { desde, hasta } = parseRange(req);

        const [visitas, remotas, tickets] = await Promise.all([
            // VISITAS CRUDAS
            // Importante: NO se consolidan por jornada.
            // Este dashboard replica el Excel de horas hombre.
            prisma.visita.findMany({
                where: {
                    inicio: {
                        gte: desde,
                        lt: hasta,
                    },
                    status: "COMPLETADA",
                    fin: {
                        not: null,
                    },
                },
                select: {
                    empresaId: true,
                    tecnicoId: true,
                    inicio: true,
                    fin: true,
                },
            }),

            // MANTENCIONES REMOTAS
            prisma.mantencionRemota.findMany({
                where: {
                    inicio: {
                        gte: desde,
                        lt: hasta,
                    },
                },
                select: {
                    empresaId: true,
                    tecnicoId: true,
                    inicio: true,
                    duracionMinutos: true,
                },
            }),

            // TICKETS CERRADOS / RESUELTOS
            // Solo se cuentan como volumen operativo.
            // No suman horas hombre.
            prisma.ticket.findMany({
                where: {
                    deletedAt: null,
                    status: {
                        in: ["RESOLVED", "CLOSED"],
                    },
                    OR: [
                        {
                            closedAt: {
                                gte: desde,
                                lt: hasta,
                            },
                        },
                        {
                            resolvedAt: {
                                gte: desde,
                                lt: hasta,
                            },
                        },
                        {
                            AND: [
                                { closedAt: null },
                                { resolvedAt: null },
                                {
                                    updatedAt: {
                                        gte: desde,
                                        lt: hasta,
                                    },
                                },
                            ],
                        },
                    ],
                },
                select: {
                    empresaId: true,
                    assigneeId: true,
                    createdAt: true,
                    resolvedAt: true,
                    closedAt: true,
                    updatedAt: true,
                },
            }),
        ]);

        /* ───────────────────────── Mapas empresa/técnico ───────────────────────── */

        const empresaIds = Array.from(
            new Set(
                [
                    ...visitas.map((v) => v.empresaId),
                    ...remotas.map((r) => r.empresaId),
                    ...tickets.map((t) => t.empresaId),
                ].filter((id): id is number => typeof id === "number")
            )
        );

        const tecnicoIds = Array.from(
            new Set(
                [
                    ...visitas.map((v) => v.tecnicoId),
                    ...remotas.map((r) => r.tecnicoId),
                    ...tickets.map((t) => t.assigneeId),
                ].filter((id): id is number => typeof id === "number")
            )
        );

        const [empresas, tecnicos] = await Promise.all([
            prisma.empresa.findMany({
                where: {
                    id_empresa: {
                        in: empresaIds,
                    },
                },
                select: {
                    id_empresa: true,
                    nombre: true,
                },
            }),

            prisma.tecnico.findMany({
                where: {
                    id_tecnico: {
                        in: tecnicoIds,
                    },
                },
                select: {
                    id_tecnico: true,
                    nombre: true,
                },
            }),
        ]);

        const empresaMap = new Map(
            empresas.map((e) => [e.id_empresa, e.nombre])
        );

        const tecnicoMap = new Map(
            tecnicos.map((t) => [t.id_tecnico, t.nombre])
        );

        /* ───────────────────────── Acumulador principal ───────────────────────── */

        const rowsMap = new Map<string, RowAgg>();

        function getRow(params: {
            tecnicoId: number;
            tecnico: string;
            empresaId: number;
            empresa: string;
        }) {
            const key = `${params.empresaId}|${params.tecnicoId}`;

            if (!rowsMap.has(key)) {
                rowsMap.set(key, {
                    tecnicoId: params.tecnicoId,
                    tecnico: params.tecnico,
                    empresaId: params.empresaId,
                    empresa: params.empresa,

                    minutosVisitas: 0,
                    minutosRemotas: 0,

                    visitas: 0,
                    remotas: 0,
                    tickets: 0,

                    meses: new Map(),
                });
            }

            return rowsMap.get(key)!;
        }

        /* ───────────────────────── 1) Visitas crudas ───────────────────────── */

        for (const v of visitas) {
            if (!v.inicio || !v.fin) continue;

            const minutos = diffMinutos(v.inicio, v.fin);
            if (minutos <= 0) continue;

            const empresaId = v.empresaId;
            const tecnicoId = v.tecnicoId;

            const empresa = empresaMap.get(empresaId) ?? `Empresa ${empresaId}`;
            const tecnico = tecnicoMap.get(tecnicoId) ?? `Técnico ${tecnicoId}`;

            const mes = toMonthKey(v.inicio);

            const row = getRow({
                empresaId,
                empresa,
                tecnicoId,
                tecnico,
            });

            const mesRow = ensureMes(row, mes);

            row.minutosVisitas += minutos;
            row.visitas += 1;

            mesRow.minutosVisitas += minutos;
            mesRow.visitas += 1;
        }

        /* ───────────────────────── 2) Mantenciones remotas ───────────────────────── */

        for (const r of remotas) {
            if (!r.empresaId || !r.tecnicoId || !r.inicio) continue;

            const minutos = Number(r.duracionMinutos ?? 0);
            if (!Number.isFinite(minutos) || minutos <= 0) continue;

            const empresa = empresaMap.get(r.empresaId) ?? `Empresa ${r.empresaId}`;
            const tecnico = tecnicoMap.get(r.tecnicoId) ?? `Técnico ${r.tecnicoId}`;

            const mes = toMonthKey(r.inicio);

            const row = getRow({
                empresaId: r.empresaId,
                empresa,
                tecnicoId: r.tecnicoId,
                tecnico,
            });

            const mesRow = ensureMes(row, mes);

            row.minutosRemotas += minutos;
            row.remotas += 1;

            mesRow.minutosRemotas += minutos;
            mesRow.remotas += 1;
        }

        /* ───────────────────────── 3) Tickets cerrados ───────────────────────── */

        for (const t of tickets) {
            if (!t.empresaId || !t.assigneeId) continue;

            const fechaCierre = t.closedAt ?? t.resolvedAt ?? t.updatedAt;

            if (!fechaCierre) continue;
            if (fechaCierre < desde || fechaCierre >= hasta) continue;

            const empresa = empresaMap.get(t.empresaId) ?? `Empresa ${t.empresaId}`;
            const tecnico = tecnicoMap.get(t.assigneeId) ?? `Técnico ${t.assigneeId}`;

            const mes = toMonthKey(fechaCierre);

            const row = getRow({
                empresaId: t.empresaId,
                empresa,
                tecnicoId: t.assigneeId,
                tecnico,
            });

            const mesRow = ensureMes(row, mes);

            row.tickets += 1;
            mesRow.tickets += 1;
        }

        /* ───────────────────────── Salida por técnico + empresa ───────────────────────── */

        const rows = Array.from(rowsMap.values())
            .map((row) => {
                const totalMinutos = row.minutosVisitas + row.minutosRemotas;

                return {
                    empresaId: row.empresaId,
                    empresa: row.empresa,

                    tecnicoId: row.tecnicoId,
                    tecnico: row.tecnico,

                    totalMinutosVisitas: row.minutosVisitas,
                    totalMinutosRemotas: row.minutosRemotas,
                    totalMinutos,

                    totalHorasVisitas: Number((row.minutosVisitas / 60).toFixed(2)),
                    totalHorasRemotas: Number((row.minutosRemotas / 60).toFixed(2)),
                    totalHorasHombre: Number((totalMinutos / 60).toFixed(2)),

                    visitas: row.visitas,

                    // Alias para compatibilidad con frontend si todavía usa "jornadas"
                    jornadas: row.visitas,

                    remotas: row.remotas,
                    tickets: row.tickets,

                    meses: Array.from(row.meses.values())
                        .map((m) => ({
                            mes: m.mes,

                            visitas: m.visitas,

                            // Alias para compatibilidad
                            jornadas: m.visitas,

                            remotas: m.remotas,
                            tickets: m.tickets,

                            horasVisitas: Number((m.minutosVisitas / 60).toFixed(2)),
                            horasRemotas: Number((m.minutosRemotas / 60).toFixed(2)),
                            horasTotal: Number(
                                ((m.minutosVisitas + m.minutosRemotas) / 60).toFixed(2)
                            ),
                        }))
                        .sort((a, b) => a.mes.localeCompare(b.mes)),
                };
            })
            .sort((a, b) => b.totalHorasHombre - a.totalHorasHombre);

        /* ───────────────────────── Resumen por técnico ───────────────────────── */

        const resumenPorTecnicoMap = new Map<
            number,
            {
                tecnicoId: number;
                tecnico: string;
                minutosVisitas: number;
                minutosRemotas: number;
                visitas: number;
                remotas: number;
                tickets: number;
            }
        >();

        for (const row of rows) {
            if (!resumenPorTecnicoMap.has(row.tecnicoId)) {
                resumenPorTecnicoMap.set(row.tecnicoId, {
                    tecnicoId: row.tecnicoId,
                    tecnico: row.tecnico,
                    minutosVisitas: 0,
                    minutosRemotas: 0,
                    visitas: 0,
                    remotas: 0,
                    tickets: 0,
                });
            }

            const tec = resumenPorTecnicoMap.get(row.tecnicoId)!;

            tec.minutosVisitas += row.totalMinutosVisitas;
            tec.minutosRemotas += row.totalMinutosRemotas;
            tec.visitas += row.visitas;
            tec.remotas += row.remotas;
            tec.tickets += row.tickets;
        }

        const resumenPorTecnico = Array.from(resumenPorTecnicoMap.values())
            .map((t) => {
                const totalMinutos = t.minutosVisitas + t.minutosRemotas;

                return {
                    tecnicoId: t.tecnicoId,
                    tecnico: t.tecnico,

                    totalHorasVisitas: Number((t.minutosVisitas / 60).toFixed(2)),
                    totalHorasRemotas: Number((t.minutosRemotas / 60).toFixed(2)),
                    totalHorasHombre: Number((totalMinutos / 60).toFixed(2)),

                    visitas: t.visitas,

                    // Alias para compatibilidad
                    jornadas: t.visitas,

                    remotas: t.remotas,
                    tickets: t.tickets,
                };
            })
            .sort((a, b) => b.totalHorasHombre - a.totalHorasHombre);

        /* ───────────────────────── KPIs generales ───────────────────────── */

        const totalMinutosVisitas = rows.reduce(
            (acc, r) => acc + r.totalMinutosVisitas,
            0
        );

        const totalMinutosRemotas = rows.reduce(
            (acc, r) => acc + r.totalMinutosRemotas,
            0
        );

        const totalTickets = rows.reduce((acc, r) => acc + r.tickets, 0);

        const totalVisitas = rows.reduce((acc, r) => acc + r.visitas, 0);

        const totalRemotas = rows.reduce((acc, r) => acc + r.remotas, 0);

        return res.json({
            ok: true,
            data: {
                periodo: {
                    desde,
                    hasta,
                },

                kpis: {
                    totalHorasVisitas: Number((totalMinutosVisitas / 60).toFixed(2)),
                    totalHorasRemotas: Number((totalMinutosRemotas / 60).toFixed(2)),
                    totalHorasHombre: Number(
                        ((totalMinutosVisitas + totalMinutosRemotas) / 60).toFixed(2)
                    ),

                    totalVisitas,

                    // Alias para compatibilidad
                    totalJornadas: totalVisitas,

                    totalRemotas,
                    totalTickets,

                    tecnicosConActividad: resumenPorTecnico.length,
                },

                resumenPorTecnico,

                porTecnicoEmpresa: rows,
            },
        });
    } catch (error) {
        console.error("[tecnicos.dashboard.horas-hombre] error:", error);

        return res.status(500).json({
            ok: false,
            message: "No se pudo obtener dashboard de horas hombre por técnico",
        });
    }
};