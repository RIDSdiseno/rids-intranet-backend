import { getDevice, getAllConnectionsHistorical, calcDurationMinutes, } from "../../service/teamviewer/teamviewer.service.js";
import { runTeamViewerSyncInternal } from "./teamviewer.controller.js";
import { prisma } from "../../lib/prisma.js";
function normalizeName(name) {
    return name
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/\s+/g, " ")
        .trim();
}
const norm = (s) => (s ?? "").trim().replace(/\s+/g, " ");
// ─── Helper: construir filtro de fechas seguro ────────────────────────────────
function buildDateFilter(fromDate, toDate, startIdx = 1) {
    const params = [];
    let sql = "";
    let idx = startIdx;
    if (fromDate) {
        sql += ` AND m.inicio >= $${idx++}`;
        params.push(fromDate);
    }
    if (toDate) {
        sql += ` AND m.inicio < $${idx++}`;
        params.push(toDate);
    }
    return { sql, params, nextIdx: idx };
}
// ─── Totales históricos por empresa ──────────────────────────────────────────
export async function getTeamViewerHistoricalTotalsByEmpresa(params) {
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
    const equipoMap = new Map();
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
    const matchedSessions = [];
    for (const session of sessions) {
        const deviceId = String(session.deviceid ?? "").trim();
        const deviceNombre = norm(session.devicename);
        let resolvedEmpresaId = null;
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
            const sol = solicitantes.find((s) => s.nombre.toLowerCase().includes(deviceNombre.toLowerCase()));
            if (sol?.empresaId) {
                resolvedEmpresaId = sol.empresaId;
            }
        }
        // 4) Match por groupname
        if (!resolvedEmpresaId && session.groupname) {
            const groupNormalized = normalizeName(session.groupname);
            const match = empresas.find((e) => {
                const empresaNorm = normalizeName(e.nombre);
                return (groupNormalized.includes(empresaNorm) ||
                    empresaNorm.includes(groupNormalized));
            });
            if (match) {
                resolvedEmpresaId = match.id_empresa;
            }
        }
        if (resolvedEmpresaId !== empresaId)
            continue;
        let fin = null;
        if (session.end_date) {
            fin = session.end_date;
        }
        else if (session.duration) {
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
export async function syncTeamViewerHistorical(req, res) {
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
    }
    catch {
        return res.status(500).json({ error: "Error sincronizando histórico TeamViewer" });
    }
}
// ─── Totales por empresa (endpoint) ──────────────────────────────────────────
export async function getTeamViewerTotalsByEmpresa(req, res) {
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
    }
    catch {
        return res.status(500).json({ error: "Error obteniendo totales históricos TeamViewer" });
    }
}
// ─── Promedios mensuales por empresa ─────────────────────────────────────────
export async function getTeamViewerMonthlyAverages(req, res) {
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
        `, ...params);
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
        `, ...params2);
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
    }
    catch (error) {
        console.error("[getTeamViewerMonthlyAverages]", error);
        return res.status(500).json({ error: "Error obteniendo promedios mensuales TeamViewer" });
    }
}
// ─── Desglose mensual por empresa ────────────────────────────────────────────
export async function getTeamViewerMonthlyBreakdown(req, res) {
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
        `, ...params);
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
    }
    catch (error) {
        console.error("[getTeamViewerMonthlyBreakdown]", error);
        return res.status(500).json({ error: "Error obteniendo desglose mensual TeamViewer" });
    }
}
//# sourceMappingURL=teamviewer-data.controller.js.map