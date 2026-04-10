import type { Request, Response } from "express";

import {
    getDevice,
    getAllConnectionsHistorical,
    calcDurationMinutes,
    type TeamViewerSession,
} from "../../service/teamviewer/teamviewer.service.js";

import { runTeamViewerSyncInternal } from "./teamviewer.controller.js";

import { prisma } from "../../lib/prisma.js";

function normalizeName(name: string) {
    return name
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/\s+/g, " ")
        .trim();
}

const norm = (s?: string | null) => (s ?? "").trim().replace(/\s+/g, " ");

// ─── Helper: construir filtro de fechas seguro ────────────────────────────────

function buildDateFilter(
    fromDate: string | undefined,
    toDate: string | undefined,
    startIdx = 1
): { sql: string; params: string[]; nextIdx: number } {
    const params: string[] = [];
    let sql = "";
    let idx = startIdx;

    if (fromDate) {
        sql += ` AND m.inicio::date >= $${idx++}::date`;
        params.push(fromDate);
    }
    if (toDate) {
        sql += ` AND m.inicio::date <= $${idx++}::date`;
        params.push(toDate);
    }

    return { sql, params, nextIdx: idx };
}

// ─── Totales históricos por empresa ──────────────────────────────────────────

export async function getTeamViewerHistoricalTotalsByEmpresa(params: {
    empresaId: number;
    fromDate?: string;
    toDate?: string;
}) {
    const { empresaId, fromDate, toDate } = params;

    const sessions = await getAllConnectionsHistorical({
        ...(fromDate ? { fromDate } : {}),
        ...(toDate ? { toDate } : {}),
    });

    if (!sessions.length) {
        return {
            ok: true,
            empresaId,
            totalSesiones: 0,
            totalMinutos: 0,
            totalHoras: 0,
            sesiones: [],
        };
    }

    const deviceIds = sessions
        .map((s) => String(s.deviceid ?? "").trim())
        .filter(Boolean);

    const deviceMaps = await prisma.teamViewerDeviceMap.findMany({
        where: { deviceId: { in: deviceIds } },
        select: { deviceId: true, empresaId: true, solicitanteId: true },
    });

    const deviceMap = new Map(deviceMaps.map((d) => [d.deviceId, d]));

    const equipos = await prisma.equipo.findMany({
        where: {
            detalle: {
                is: { teamViewer: { in: deviceIds } },
            },
        },
        select: {
            detalle: { select: { teamViewer: true } },
            solicitante: {
                select: { id_solicitante: true, empresaId: true, nombre: true },
            },
        },
    });

    const equipoMap = new Map<string, any>();
    for (const eq of equipos) {
        if (eq.detalle?.teamViewer) {
            equipoMap.set(eq.detalle.teamViewer, eq.solicitante);
        }
    }

    const solicitantes = await prisma.solicitante.findMany({
        select: { id_solicitante: true, empresaId: true, nombre: true },
    });

    const empresas = await prisma.empresa.findMany({
        select: { id_empresa: true, nombre: true },
    });

    const matchedSessions: Array<{
        id: string;
        inicio: string;
        fin: string | null;
        deviceId: string | null;
        deviceNombre: string | null;
        minutos: number;
    }> = [];

    for (const session of sessions) {
        const deviceId = String(session.deviceid ?? "").trim();
        const deviceNombre = norm(session.devicename);

        let resolvedEmpresaId: number | null = null;

        // 1) Mapa explícito
        const explicitMap = deviceMap.get(deviceId);
        if (explicitMap?.empresaId) {
            resolvedEmpresaId = explicitMap.empresaId;
        }

        // 2) Inventario
        if (!resolvedEmpresaId && deviceId) {
            const sol = equipoMap.get(deviceId);
            if (sol?.empresaId) {
                resolvedEmpresaId = sol.empresaId;
            }
        }

        // 3) Fallback por nombre
        if (!resolvedEmpresaId && deviceNombre) {
            const sol = solicitantes.find((s) =>
                s.nombre.toLowerCase().includes(deviceNombre.toLowerCase())
            );
            if (sol?.empresaId) {
                resolvedEmpresaId = sol.empresaId;
            }
        }

        // 4) Match por groupname
        if (!resolvedEmpresaId && session.groupname) {
            const groupNormalized = normalizeName(session.groupname);
            const match = empresas.find((e) => {
                const empresaNorm = normalizeName(e.nombre);
                return (
                    groupNormalized.includes(empresaNorm) ||
                    empresaNorm.includes(groupNormalized)
                );
            });
            if (match) {
                resolvedEmpresaId = match.id_empresa;
            }
        }

        if (resolvedEmpresaId !== empresaId) continue;

        let fin: string | null = null;
        if (session.end_date) {
            fin = session.end_date;
        } else if (session.duration) {
            const inicio = new Date(session.start_date);
            fin = new Date(inicio.getTime() + session.duration * 1000).toISOString();
        }

        const minutos = calcDurationMinutes(session);

        matchedSessions.push({
            id: session.id,
            inicio: session.start_date,
            fin,
            deviceId: deviceId || null,
            deviceNombre: deviceNombre || null,
            minutos,
        });
    }

    const totalMinutos = matchedSessions.reduce((acc, s) => acc + s.minutos, 0);

    return {
        ok: true,
        empresaId,
        totalSesiones: matchedSessions.length,
        totalMinutos,
        totalHoras: Number((totalMinutos / 60).toFixed(2)),
        sesiones: matchedSessions,
    };
}

// ─── Sync histórico ───────────────────────────────────────────────────────────

export async function syncTeamViewerHistorical(req: Request, res: Response) {
    try {
        const fromDate = typeof req.query.fromDate === "string" ? req.query.fromDate : undefined;
        const toDate = typeof req.query.toDate === "string" ? req.query.toDate : undefined;

        if (!fromDate || !toDate) {
            return res.status(400).json({ error: "fromDate y toDate son obligatorios" });
        }

        const result = await runTeamViewerSyncInternal({
            fromDate,
            toDate,
            fullHistorical: true,
        });

        return res.json(result);
    } catch {
        return res.status(500).json({ error: "Error sincronizando histórico TeamViewer" });
    }
}

// ─── Totales por empresa (endpoint) ──────────────────────────────────────────

export async function getTeamViewerTotalsByEmpresa(req: Request, res: Response) {
    try {
        const empresaId = Number(req.query.empresaId);
        const fromDate = typeof req.query.fromDate === "string" ? req.query.fromDate : undefined;
        const toDate = typeof req.query.toDate === "string" ? req.query.toDate : undefined;

        if (!empresaId || Number.isNaN(empresaId)) {
            return res.status(400).json({ error: "empresaId requerido" });
        }

        const result = await getTeamViewerHistoricalTotalsByEmpresa({
            empresaId,
            ...(fromDate ? { fromDate } : {}),
            ...(toDate ? { toDate } : {}),
        });

        return res.json(result);
    } catch {
        return res.status(500).json({ error: "Error obteniendo totales históricos TeamViewer" });
    }
}

// ─── Promedios mensuales por empresa ─────────────────────────────────────────

export async function getTeamViewerMonthlyAverages(req: Request, res: Response) {
    try {
        const fromDate = typeof req.query.fromDate === "string" ? req.query.fromDate : undefined;
        const toDate = typeof req.query.toDate === "string" ? req.query.toDate : undefined;

        const { sql: dateFilter, params } = buildDateFilter(fromDate, toDate, 1);

        // ── Query principal (CTE con promedios) ──
        const rows = await prisma.$queryRawUnsafe(`
            WITH mensual AS (
                SELECT
                    e.id_empresa,
                    e.nombre AS empresa,
                    DATE_TRUNC('month', m.inicio) AS mes,
                    COUNT(m.id_mantencion)              AS sesiones_mes,
                    COALESCE(SUM(m."duracionMinutos"), 0) AS minutos_mes
                FROM "MantencionRemota" m
                JOIN "Empresa" e ON e.id_empresa = m."empresaId"
                WHERE m.origen = 'TEAMVIEWER'
                ${dateFilter}
                GROUP BY e.id_empresa, e.nombre, DATE_TRUNC('month', m.inicio)
            )
            SELECT
                id_empresa,
                empresa,
                ROUND(AVG(sesiones_mes), 2) AS promedio_sesiones_mes,
                ROUND(AVG(minutos_mes),  2) AS promedio_minutos_mes
            FROM mensual
            GROUP BY id_empresa, empresa
            ORDER BY AVG(minutos_mes) DESC, empresa ASC
        `, ...params) as any[];

        // ── Query de totales globales ──
        // buildDateFilter con los mismos params desde idx=1
        const { sql: dateFilter2, params: params2 } = buildDateFilter(fromDate, toDate, 1);

        const totals = await prisma.$queryRawUnsafe(`
            SELECT
                COUNT(DISTINCT m."empresaId")           AS empresas,
                COUNT(m.id_mantencion)                  AS "totalSesiones",
                COALESCE(SUM(m."duracionMinutos"), 0)   AS "totalMinutos"
            FROM "MantencionRemota" m
            WHERE m.origen = 'TEAMVIEWER'
            ${dateFilter2}
        `, ...params2) as any[];

        const raw = totals[0] ?? { empresas: 0, totalSesiones: 0, totalMinutos: 0 };

        const totalMinutos = Number(raw.totalMinutos ?? 0);

        // ── Serializar BigInt ──
        const items = rows.map((r) => ({
            id_empresa: Number(r.id_empresa),
            empresa: r.empresa,
            promedio_sesiones_mes: Number(r.promedio_sesiones_mes),
            promedio_minutos_mes: Number(r.promedio_minutos_mes),
        }));

        return res.json({
            ok: true,
            items,
            summary: {
                empresas: Number(raw.empresas ?? 0),
                totalSesiones: Number(raw.totalSesiones ?? 0),
                totalMinutos,
                totalHoras: Math.round(totalMinutos / 60),
            },
        });
    } catch (error) {
        console.error("[getTeamViewerMonthlyAverages]", error);
        return res.status(500).json({ error: "Error obteniendo promedios mensuales TeamViewer" });
    }
}

// ─── Desglose mensual por empresa ────────────────────────────────────────────

export async function getTeamViewerMonthlyBreakdown(req: Request, res: Response) {
    try {
        const fromDate = typeof req.query.fromDate === "string" ? req.query.fromDate : undefined;
        const toDate = typeof req.query.toDate === "string" ? req.query.toDate : undefined;

        const { sql: dateFilter, params } = buildDateFilter(fromDate, toDate, 1);

        const rows = await prisma.$queryRawUnsafe(`
            SELECT
                e.id_empresa,
                e.nombre                                                        AS empresa,
                TO_CHAR(DATE_TRUNC('month', m.inicio), 'YYYY-MM')              AS mes,
                COUNT(m.id_mantencion)                                          AS sesiones_mes,
                COALESCE(SUM(m."duracionMinutos"), 0)                          AS minutos_mes,
                ROUND(COALESCE(SUM(m."duracionMinutos"), 0) / 60.0, 0)        AS horas_mes
            FROM "MantencionRemota" m
            JOIN "Empresa" e ON e.id_empresa = m."empresaId"
            WHERE m.origen = 'TEAMVIEWER'
            ${dateFilter}
            GROUP BY
                e.id_empresa,
                e.nombre,
                DATE_TRUNC('month', m.inicio)
            ORDER BY
                e.nombre ASC,
                DATE_TRUNC('month', m.inicio) ASC
        `, ...params) as any[];

        // ── Serializar BigInt ──
        const items = rows.map((r) => ({
            id_empresa: Number(r.id_empresa),
            empresa: r.empresa,
            mes: r.mes,
            sesiones_mes: Number(r.sesiones_mes),
            minutos_mes: Number(r.minutos_mes),
            horas_mes: Number(r.horas_mes),
        }));

        return res.json({ ok: true, items });
    } catch (error) {
        console.error("[getTeamViewerMonthlyBreakdown]", error);
        return res.status(500).json({ error: "Error obteniendo desglose mensual TeamViewer" });
    }
}

export async function runBackfillTeamViewerDurationsInternal(params: {
    empresaId?: number;
    fromDate: string;
    toDate: string;
}) {
    const { empresaId, fromDate, toDate } = params;

    const whereClause = {
        ...(empresaId !== undefined ? { empresaId } : {}),
        origen: "TEAMVIEWER" as const,
        duracionMinutos: null,
        inicio: {
            gte: new Date(`${fromDate}T00:00:00.000Z`),
            lt: new Date(`${toDate}T23:59:59.999Z`),
        },
        NOT: {
            teamviewerId: null,
        },
    };

    const faltantes = await prisma.mantencionRemota.findMany({
        where: whereClause,
        select: {
            id_mantencion: true,
            teamviewerId: true,
            inicio: true,
            fin: true,
        },
    });

    if (!faltantes.length) {
        return {
            ok: true,
            empresaId: empresaId ?? null,
            totalFaltantes: 0,
            actualizadas: 0,
            sinMatch: 0,
            sinDuracionConfiable: 0,
        };
    }

    const sessions = (await getAllConnectionsHistorical({
        fromDate,
        toDate,
    })) as TeamViewerSession[];

    const sessionById = new Map<string, TeamViewerSession>();
    for (const s of sessions ?? []) {
        if (s?.id) sessionById.set(s.id, s);
    }

    let actualizadas = 0;
    let sinMatch = 0;
    let sinDuracionConfiable = 0;

    for (const row of faltantes) {
        const tvId = row.teamviewerId ?? "";
        const session = sessionById.get(tvId);

        if (!session) {
            sinMatch++;
            continue;
        }

        const tieneDuracion =
            typeof session.duration === "number" && session.duration >= 0;
        const tieneFin = !!session.end_date;

        if (!tieneDuracion && !tieneFin) {
            sinDuracionConfiable++;
            continue;
        }

        const minutos = calcDurationMinutes(session);
        if (!Number.isFinite(minutos) || minutos < 0) {
            sinDuracionConfiable++;
            continue;
        }

        let finTeamViewer: Date;

        if (session.end_date) {
            finTeamViewer = new Date(session.end_date);
        } else {
            const durationSeconds = session.duration;

            if (typeof durationSeconds !== "number" || durationSeconds < 0) {
                sinDuracionConfiable++;
                continue;
            }

            finTeamViewer = new Date(
                new Date(session.start_date).getTime() + durationSeconds * 1000
            );
        }

        await prisma.mantencionRemota.update({
            where: { id_mantencion: row.id_mantencion },
            data: {
                duracionMinutos: minutos,
                fin: finTeamViewer,
                status: "COMPLETADA",
            },
        });

        actualizadas++;
    }

    return {
        ok: true,
        empresaId: empresaId ?? null,
        totalFaltantes: faltantes.length,
        actualizadas,
        sinMatch,
        sinDuracionConfiable,
    };
}

export async function backfillTeamViewerDurations(req: Request, res: Response) {
    try {
        const empresaIdRaw = req.body?.empresaId;
        const empresaId =
            empresaIdRaw === undefined || empresaIdRaw === null || empresaIdRaw === ""
                ? undefined
                : Number(empresaIdRaw);

        const fromDate = typeof req.body?.fromDate === "string" ? req.body.fromDate : undefined;
        const toDate = typeof req.body?.toDate === "string" ? req.body.toDate : undefined;

        if (empresaId !== undefined && Number.isNaN(empresaId)) {
            return res.status(400).json({ error: "empresaId inválido" });
        }

        if (!fromDate || !toDate) {
            return res.status(400).json({ error: "fromDate y toDate son obligatorios" });
        }

        const result = await runBackfillTeamViewerDurationsInternal({
            ...(empresaId !== undefined ? { empresaId } : {}),
            fromDate,
            toDate,
        });

        return res.json(result);
    } catch (error) {
        console.error("[backfillTeamViewerDurations]", error);
        return res.status(500).json({
            error: "Error haciendo backfill de duraciones TeamViewer",
        });
    }
}