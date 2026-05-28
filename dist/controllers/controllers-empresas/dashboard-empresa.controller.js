import { prisma } from "../../lib/prisma.js";
import { DateTime } from "luxon";
// ─── Helpers (sin cambios respecto al original) ───────────────────────────────
function toNumber(value) {
    const n = Number(value);
    return Number.isFinite(n) && n > 0 ? n : null;
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
        if (status && status !== "COMPLETADA")
            continue;
        if (!visita.inicio || !visita.fin)
            continue;
        const inicioMs = visita.inicio.getTime();
        const finMs = visita.fin.getTime();
        if (!Number.isFinite(inicioMs) || !Number.isFinite(finMs))
            continue;
        if (finMs <= inicioMs)
            continue;
        const dia = getLocalDateKey(visita.inicio);
        const actual = intervalosPorDia.get(dia) ?? [];
        actual.push({ inicioMs, finMs });
        intervalosPorDia.set(dia, actual);
    }
    let totalMinutos = 0;
    for (const intervalos of intervalosPorDia.values()) {
        const ordenados = [...intervalos].sort((a, b) => a.inicioMs - b.inicioMs);
        const primero = ordenados[0];
        if (!primero)
            continue;
        let bloqueInicio = primero.inicioMs;
        let bloqueFin = primero.finMs;
        for (let i = 1; i < ordenados.length; i++) {
            const actual = ordenados[i];
            if (!actual)
                continue;
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
    return { totalMinutos, diasConVisitas: intervalosPorDia.size };
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
function buildMonthlyRangeSantiago(mes, ano) {
    const desde = DateTime.fromObject({ year: Number(ano), month: Number(mes), day: 1, hour: 0, minute: 0, second: 0, millisecond: 0 }, { zone: "America/Santiago" }).toUTC();
    const hasta = desde.plus({ months: 1 });
    return { desde: desde.toJSDate(), hasta: hasta.toJSDate() };
}
// ─── NUEVO: mes anterior ──────────────────────────────────────────────────────
function buildPrevMonthRange(mes, ano) {
    const dt = DateTime.fromObject({ year: Number(ano), month: Number(mes), day: 1 }, { zone: "America/Santiago" }).minus({ months: 1 });
    const desde = dt.startOf("month").toUTC();
    const hasta = desde.plus({ months: 1 });
    return { desde: desde.toJSDate(), hasta: hasta.toJSDate() };
}
// ─── NUEVO: etiqueta corta de mes ─────────────────────────────────────────────
function labelMes(dt) {
    // "2025-03"
    return dt.toFormat("yyyy-MM");
}
// ─── NUEVO: cálculo de minutos por ticket ─────────────────────────────────────
//
// Usa resolvedAt ?? closedAt como fecha de fin.
// Cap de 8h (480 min) por ticket para evitar que un ticket abierto durante días
// enteros infle el tiempo de soporte. Los tickets aún abiertos aportan 0 min.
function calcularMinutosTicket(createdAt, resolvedAt, closedAt) {
    const fin = resolvedAt ?? closedAt;
    if (!fin)
        return 0;
    const ms = fin.getTime() - createdAt.getTime();
    if (ms <= 0)
        return 0;
    return Math.min(Math.round(ms / 60000), 480); // cap 8h
}
// ─── Controller principal ─────────────────────────────────────────────────────
export async function getEmpresaDashboard(req, res) {
    try {
        const empresaId = toNumber(req.params.id);
        if (!empresaId) {
            return res.status(400).json({ ok: false, message: "ID de empresa inválido" });
        }
        const mes = normalizeMes(req.query.mes);
        const ano = normalizeAno(req.query.ano);
        const { desde, hasta } = buildMonthlyRangeSantiago(mes, ano);
        const user = req.user;
        const rol = String(user?.rol ?? "").toUpperCase();
        if (rol === "CLIENTE" && Number(user.empresaId) !== empresaId) {
            return res.status(403).json({ ok: false, message: "No tienes permisos para ver esta empresa" });
        }
        const empresa = await prisma.empresa.findUnique({
            where: { id_empresa: empresaId },
            select: { id_empresa: true, nombre: true },
        });
        if (!empresa) {
            return res.status(404).json({ ok: false, message: "Empresa no encontrada" });
        }
        // ── Rango mes anterior (para comparación) ────────────────────────────
        const { desde: desdeAnt, hasta: hastaAnt } = buildPrevMonthRange(mes, ano);
        // ── NUEVO: rangos para tendencia últimos 6 meses ──────────────────────
        // Calculamos el inicio del mes actual y retrocedemos 5 meses más
        const inicioTendencia = DateTime.fromObject({ year: Number(ano), month: Number(mes), day: 1 }, { zone: "America/Santiago" }).minus({ months: 5 }).toUTC().toJSDate();
        // El fin es el mismo "hasta" del mes actual
        // ── Queries paralelas (todas de una vez) ──────────────────────────────
        const [totalSolicitantesActivos, totalEquipos, equiposPorMarcaRaw, equiposEmpresa, ultimosEquipos, 
        // Mes actual
        visitasMes, mantencionesRemotasMes, ticketsMes, 
        // Mes anterior
        visitasMesAnt, mantencionesRemotasMesAnt, ticketsMesAnt, 
        // Tendencia 6 meses
        visitasTendencia, remotasTendencia, ticketsTendencia,] = await Promise.all([
            // ── Solicitantes activos ──────────────────────────────────────────
            prisma.solicitante.count({
                where: { empresaId, isActive: true },
            }),
            // ── Total equipos de la empresa ───────────────────────────────────
            prisma.equipo.count({
                where: { solicitante: { is: { empresaId } } },
            }),
            // ── Equipos por marca ─────────────────────────────────────────────
            prisma.equipo.groupBy({
                by: ["marca"],
                where: { solicitante: { is: { empresaId } } },
                _count: { _all: true },
                orderBy: { _count: { marca: "desc" } },
            }),
            // ── Equipos por solicitante ───────────────────────────────────────
            prisma.equipo.findMany({
                where: { solicitante: { is: { empresaId, isActive: true } } },
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
            // ── Últimos equipos registrados ───────────────────────────────────
            prisma.equipo.findMany({
                where: { solicitante: { is: { empresaId } } },
                orderBy: { createdAt: "desc" },
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
            // ── Visitas mes actual ────────────────────────────────────────────
            prisma.visita.findMany({
                where: {
                    empresaId,
                    inicio: { gte: desde, lt: hasta },
                },
                select: {
                    id_visita: true,
                    empresaId: true,
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
            // ── Mantenciones remotas mes actual ───────────────────────────────
            prisma.mantencionRemota.findMany({
                where: {
                    empresaId,
                    inicio: { gte: desde, lt: hasta },
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
            // ── Tickets RIDS mes actual ───────────────────────────────────────
            prisma.ticket.findMany({
                where: {
                    empresaId,
                    createdAt: { gte: desde, lt: hasta },
                    deletedAt: null,
                },
                select: {
                    id: true,
                    createdAt: true,
                    resolvedAt: true,
                    closedAt: true,
                    status: true,
                },
            }),
            // ── Visitas mes anterior ──────────────────────────────────────────
            prisma.visita.findMany({
                where: {
                    empresaId,
                    inicio: { gte: desdeAnt, lt: hastaAnt },
                    status: "COMPLETADA",
                    fin: { not: null },
                },
                select: {
                    empresaId: true,
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
            // ── Mantenciones remotas mes anterior ─────────────────────────────
            prisma.mantencionRemota.findMany({
                where: {
                    empresaId,
                    inicio: { gte: desdeAnt, lt: hastaAnt },
                },
                select: {
                    duracionMinutos: true,
                    inicio: true,
                    fin: true,
                },
            }),
            // ── Tickets RIDS mes anterior ─────────────────────────────────────
            prisma.ticket.findMany({
                where: {
                    empresaId,
                    createdAt: { gte: desdeAnt, lt: hastaAnt },
                    deletedAt: null,
                },
                select: {
                    id: true,
                    createdAt: true,
                    resolvedAt: true,
                    closedAt: true,
                    status: true,
                },
            }),
            // ── Visitas para tendencia 6 meses ────────────────────────────────
            prisma.visita.findMany({
                where: {
                    empresaId,
                    inicio: { gte: inicioTendencia, lt: hasta },
                    status: "COMPLETADA",
                    fin: { not: null },
                },
                select: {
                    empresaId: true,
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
            // ── Mantenciones remotas para tendencia 6 meses ───────────────────
            prisma.mantencionRemota.findMany({
                where: {
                    empresaId,
                    inicio: { gte: inicioTendencia, lt: hasta },
                },
                select: {
                    inicio: true,
                    fin: true,
                    duracionMinutos: true,
                },
            }),
            // ── Tickets RIDS para tendencia 6 meses ───────────────────────────
            prisma.ticket.findMany({
                where: {
                    empresaId,
                    createdAt: { gte: inicioTendencia, lt: hasta },
                    deletedAt: null,
                },
                select: {
                    createdAt: true,
                    resolvedAt: true,
                    closedAt: true,
                    status: true,
                },
            }),
        ]);
        // ── Procesamiento mes actual (idéntico al original) ───────────────────
        const visitasPresencialesMes = visitasMes.filter((v) => {
            const status = String(v.status ?? "").toUpperCase();
            return status === "COMPLETADA" && v.inicio && v.fin && v.fin.getTime() > v.inicio.getTime();
        });
        const visitasPorDiaMap = new Map();
        for (const visita of visitasPresencialesMes) {
            if (!visita.inicio)
                continue;
            const dia = getLocalDateKey(visita.inicio);
            visitasPorDiaMap.set(dia, (visitasPorDiaMap.get(dia) ?? 0) + 1);
        }
        const visitasPorDia = Array.from(visitasPorDiaMap.entries())
            .map(([dia, total]) => ({ dia, total }))
            .sort((a, b) => a.dia.localeCompare(b.dia));
        const { totalMinutos: minutosVisitas, diasConVisitas: diasConVisitasMes } = calcularMinutosJornadaVisitas(visitasPresencialesMes);
        const minutosRemotos = mantencionesRemotasMes.reduce((acc, m) => {
            const d = Number(m.duracionMinutos ?? 0);
            return acc + (Number.isFinite(d) && d > 0 ? d : 0);
        }, 0);
        const totalMinutosSoporte = minutosVisitas + minutosRemotos;
        const horasSoporte = Math.round(totalMinutosSoporte / 60);
        // ── Tickets RIDS mes actual ───────────────────────────────────────────
        //
        // minutosTickets: suma de (resolvedAt|closedAt) - createdAt, cap 8h por ticket.
        // Solo tickets cerrados o resueltos aportan minutos; los abiertos aportan 0.
        const minutosTickets = ticketsMes.reduce((acc, t) => acc + calcularMinutosTicket(t.createdAt, t.resolvedAt, t.closedAt), 0);
        const ticketsMesTotal = ticketsMes.length;
        const ticketsMesResueltos = ticketsMes.filter((t) => t.status === "RESOLVED" || t.status === "CLOSED").length;
        const ticketsMesAbiertos = ticketsMesTotal - ticketsMesResueltos;
        // Total consolidado incluyendo tickets
        const totalMinutosSoporteConTickets = minutosVisitas + minutosRemotos + minutosTickets;
        const horasSoporteConTickets = Math.round(totalMinutosSoporteConTickets / 60);
        const equiposPorMarca = equiposPorMarcaRaw.map((item) => ({
            marca: item.marca || "Sin marca",
            total: item._count._all,
        }));
        const equiposPorSolicitanteMap = new Map();
        for (const eq of equiposEmpresa) {
            const sol = eq.solicitante?.nombre ?? "Sin solicitante";
            equiposPorSolicitanteMap.set(sol, (equiposPorSolicitanteMap.get(sol) ?? 0) + 1);
        }
        const solicitantesConMasEquipos = Array.from(equiposPorSolicitanteMap.entries())
            .map(([solicitante, total]) => ({ solicitante, total }))
            .sort((a, b) => b.total - a.total)
            .slice(0, 10);
        const visitasPorTecnicoMap = new Map();
        for (const visita of visitasMes) {
            const tecnico = visita.tecnico?.nombre ?? "Sin técnico";
            visitasPorTecnicoMap.set(tecnico, (visitasPorTecnicoMap.get(tecnico) ?? 0) + 1);
        }
        const visitasPorTecnico = Array.from(visitasPorTecnicoMap.entries())
            .map(([tecnico, total]) => ({ tecnico, total }))
            .sort((a, b) => b.total - a.total);
        // ── NUEVO: KPIs mes anterior ──────────────────────────────────────────
        const { totalMinutos: minutosVisitasAnt } = calcularMinutosJornadaVisitas(visitasMesAnt);
        const minutosRemotosAnt = mantencionesRemotasMesAnt.reduce((acc, m) => {
            const d = Number(m.duracionMinutos ?? 0);
            return acc + (Number.isFinite(d) && d > 0 ? d : 0);
        }, 0);
        const totalMinutosSoporteAnt = minutosVisitasAnt + minutosRemotosAnt;
        const horasSoporteMesAnterior = Math.round(totalMinutosSoporteAnt / 60);
        const visitasPresencialesMesAnterior = visitasMesAnt.length;
        // Tickets mes anterior (para comparación DeltaBadge)
        const minutosTicketsAnt = ticketsMesAnt.reduce((acc, t) => acc + calcularMinutosTicket(t.createdAt, t.resolvedAt, t.closedAt), 0);
        const horasSoporteAntConTickets = Math.round((minutosVisitasAnt + minutosRemotosAnt + minutosTicketsAnt) / 60);
        // ── NUEVO: Tendencia últimos 6 meses ──────────────────────────────────
        //
        // Construimos los 6 slots de mes (del más antiguo al más reciente)
        // y acumulamos visitas presenciales, remotas y minutos de soporte por slot.
        const tendenciaSlots = new Map();
        // Generar los 6 labels ordenados
        const baseMonth = DateTime.fromObject({ year: Number(ano), month: Number(mes), day: 1 }, { zone: "America/Santiago" });
        for (let i = 5; i >= 0; i--) {
            const dt = baseMonth.minus({ months: i });
            const key = labelMes(dt);
            tendenciaSlots.set(key, { label: key, visitas: 0, remotas: 0, tickets: 0, minutos: 0 });
        }
        // Acumular visitas presenciales en la tendencia
        for (const v of visitasTendencia) {
            if (!v.inicio)
                continue;
            const dt = DateTime.fromJSDate(v.inicio, { zone: "America/Santiago" });
            const key = dt.toFormat("yyyy-MM");
            const slot = tendenciaSlots.get(key);
            if (!slot)
                continue;
            slot.visitas += 1;
            if (v.fin) {
                const mins = Math.round((v.fin.getTime() - v.inicio.getTime()) / 60000);
                if (mins > 0)
                    slot.minutos += mins;
            }
        }
        // Acumular mantenciones remotas en la tendencia
        for (const m of remotasTendencia) {
            if (!m.inicio)
                continue;
            const dt = DateTime.fromJSDate(m.inicio, { zone: "America/Santiago" });
            const key = dt.toFormat("yyyy-MM");
            const slot = tendenciaSlots.get(key);
            if (!slot)
                continue;
            slot.remotas += 1;
            const d = Number(m.duracionMinutos ?? 0);
            if (Number.isFinite(d) && d > 0)
                slot.minutos += d;
        }
        // Acumular tickets RIDS en la tendencia
        for (const t of ticketsTendencia) {
            const dt = DateTime.fromJSDate(t.createdAt, { zone: "America/Santiago" });
            const key = dt.toFormat("yyyy-MM");
            const slot = tendenciaSlots.get(key);
            if (!slot)
                continue;
            slot.tickets += 1;
            const mins = calcularMinutosTicket(t.createdAt, t.resolvedAt, t.closedAt);
            if (mins > 0)
                slot.minutos += mins;
        }
        const tendencia6Meses = Array.from(tendenciaSlots.values());
        // ── Respuesta ─────────────────────────────────────────────────────────
        return res.json({
            ok: true,
            data: {
                empresa,
                periodo: { mes, ano, desde, hasta },
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
                    minutosTickets,
                    totalMinutosSoporte, // visitas + remotas (compatibilidad)
                    horasSoporte, // visitas + remotas (compatibilidad)
                    totalMinutosSoporteConTickets, // visitas + remotas + tickets
                    horasSoporteConTickets, // visitas + remotas + tickets
                    // Tickets del mes
                    ticketsMes: ticketsMesTotal,
                    ticketsMesResueltos,
                    ticketsMesAbiertos,
                    // Comparación mes anterior (para DeltaBadge)
                    visitasMesAnterior: visitasPresencialesMesAnterior,
                    horasSoporteMesAnterior, // visitas + remotas ant.
                    horasSoporteAntConTickets, // visitas + remotas + tickets ant.
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
                        // Solo agrega la barra de tickets si hay actividad (evita
                        // mostrar "0h" para empresas sin tickets ese mes)
                        ...(minutosTickets > 0 ? [{
                                tipo: "Tickets",
                                minutos: minutosTickets,
                                horas: Math.round(minutosTickets / 60),
                            }] : []),
                    ],
                    // Tendencia últimos 6 meses — ahora incluye tickets y minutos totales
                    // Cada elemento: { label, visitas, remotas, tickets, minutos }
                    tendencia6Meses,
                },
                ultimosEquipos: ultimosEquipos.map((eq) => ({
                    id_equipo: eq.id_equipo,
                    serial: eq.serial,
                    marca: eq.marca,
                    modelo: eq.modelo,
                    solicitante: eq.solicitante?.nombre ?? null,
                    createdAt: eq.createdAt,
                    updatedAt: eq.updatedAt,
                })),
            },
        });
    }
    catch (error) {
        console.error("getEmpresaDashboard error:", error);
        return res.status(500).json({ ok: false, message: "Error al obtener dashboard de empresa" });
    }
}
//# sourceMappingURL=dashboard-empresa.controller.js.map