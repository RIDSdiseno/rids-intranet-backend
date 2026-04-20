import { prisma } from "../lib/prisma.js";
import { z } from "zod";
/* ------------------------------------ */
/* Helpers comunes                       */
/* ------------------------------------ */
const visitaSelect = {
    id_visita: true,
    empresaId: true,
    tecnicoId: true,
    solicitante: true,
    inicio: true,
    fin: true,
    direccion_visita: true,
    sucursalId: true,
    confImpresoras: true,
    confTelefonos: true,
    confPiePagina: true,
    otros: true,
    otrosDetalle: true,
    status: true,
    solicitanteId: true,
    actualizaciones: true,
    antivirus: true,
    ccleaner: true,
    estadoDisco: true,
    licenciaOffice: true,
    licenciaWindows: true,
    mantenimientoReloj: true,
    rendimientoEquipo: true,
    empresa: { select: { id_empresa: true, nombre: true } },
    tecnico: { select: { id_tecnico: true, nombre: true } },
    solicitanteRef: { select: { id_solicitante: true, nombre: true } },
    sucursal: {
        select: {
            id_sucursal: true,
            nombre: true
        }
    }
};
const StatusEnum = z.enum(["PENDIENTE", "COMPLETADA", "CANCELADA"]);
const baseFlags = z.object({
    confImpresoras: z.boolean().optional().default(false),
    confTelefonos: z.boolean().optional().default(false),
    confPiePagina: z.boolean().optional().default(false),
    otros: z.boolean().optional().default(false),
    otrosDetalle: z.string().trim().optional().nullable(),
    actualizaciones: z.boolean().optional().default(false),
    antivirus: z.boolean().optional().default(false),
    ccleaner: z.boolean().optional().default(false),
    estadoDisco: z.boolean().optional().default(false),
    licenciaOffice: z.boolean().optional().default(false),
    licenciaWindows: z.boolean().optional().default(false),
    mantenimientoReloj: z.boolean().optional().default(false),
    rendimientoEquipo: z.boolean().optional().default(false),
});
/* ========== Create/Update Schemas ========== */
/**
 * Compatible con modo actual (uno solo):
 *  - solicitanteId? / solicitante?
 *
 * Modo lote (N visitas en una llamada):
 *  - solicitantesIds?: number[]
 *  - solicitantesNombres?: string[]
 *
 * Regla: o envías (solicitanteId | solicitante) || (solicitantesIds | solicitantesNombres)
 */
const CreateVisitaSchema = z
    .object({
    empresaId: z.number().int().positive(),
    tecnicoId: z.number().int().positive(),
    direccion_visita: z.string().trim().optional().nullable(),
    sucursalId: z.number().int().positive().optional(),
    // MODO "UNO"
    solicitanteId: z.number().int().positive().optional(),
    solicitante: z.string().trim().optional(),
    // MODO "LOTE"
    solicitantesIds: z.array(z.number().int().positive()).optional(),
    solicitantesNombres: z.array(z.string().trim().min(1)).optional(),
    inicio: z.coerce.date(), // ISO -> Date
    fin: z.coerce.date().optional().nullable(),
    status: StatusEnum.optional().default("PENDIENTE"),
})
    .extend(baseFlags.shape)
    .superRefine((d, ctx) => {
    const hasBatch = (d.solicitantesIds && d.solicitantesIds.length > 0) ||
        (d.solicitantesNombres && d.solicitantesNombres.length > 0);
    const hasSingle = !!d.solicitanteId || (d.solicitante && d.solicitante.trim().length > 0);
    if (!hasBatch && !hasSingle) {
        ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: "Debes enviar: (solicitanteId o solicitante) o (solicitantesIds/solicitantesNombres).",
            path: ["solicitante"],
        });
    }
});
const UpdateVisitaSchema = z
    .object({
    empresaId: z.number().int().positive().optional(),
    tecnicoId: z.number().int().positive().optional(),
    direccion_visita: z.string().trim().optional().nullable(),
    sucursalId: z.number().int().positive().optional(),
    solicitanteId: z.number().int().positive().optional(),
    solicitante: z.string().trim().optional(),
    inicio: z.coerce.date().optional(),
    fin: z.coerce.date().optional().nullable(),
    status: StatusEnum.optional(),
})
    .extend(baseFlags.partial().shape);
const parseId = (raw) => {
    const n = Number(raw);
    return Number.isInteger(n) && n > 0 ? n : null;
};
/* ------------------------------------ */
/* Listado paginado + filtros            */
/* ------------------------------------ */
export const listVisitas = async (req, res) => {
    const page = Math.max(1, Number(req.query.page ?? 1));
    const pageSize = Math.min(100, Math.max(1, Number(req.query.pageSize ?? 10)));
    const tecnicoIdQ = req.query.tecnicoId;
    const empresaIdQ = req.query.empresaId;
    const statusQ = req.query.status;
    const q = req.query.q?.trim();
    // NUEVO: filtros por mes/año
    const monthQ = req.query.month;
    const yearQ = req.query.year;
    let dateFilter;
    const month = monthQ ? Number(monthQ) : NaN;
    const year = yearQ ? Number(yearQ) : NaN;
    if (!Number.isNaN(month) && !Number.isNaN(year) && month >= 1 && month <= 12) {
        // Inicio y fin del mes
        const from = new Date(year, month - 1, 1, 0, 0, 0, 0);
        const to = new Date(year, month, 1, 0, 0, 0, 0);
        dateFilter = { gte: from, lt: to };
    }
    const INS = "insensitive";
    const user = req.user;
    const where = {
        ...(user?.rol === "CLIENTE"
            ? { empresaId: user.empresaId }
            : empresaIdQ
                ? { empresaId: Number(empresaIdQ) }
                : {}),
        ...(tecnicoIdQ ? { tecnicoId: Number(tecnicoIdQ) } : {}),
        ...(statusQ ? { status: statusQ } : {}),
        ...(dateFilter ? { inicio: dateFilter } : {}),
        ...(q
            ? {
                OR: [
                    { solicitante: { contains: q, mode: INS } },
                    { otrosDetalle: { contains: q, mode: INS } },
                    { empresa: { is: { nombre: { contains: q, mode: INS } } } },
                    { tecnico: { is: { nombre: { contains: q, mode: INS } } } },
                    { solicitanteRef: { is: { nombre: { contains: q, mode: INS } } } },
                ],
            }
            : {}),
    };
    const [total, rows] = await Promise.all([
        prisma.visita.count({ where }),
        prisma.visita.findMany({
            where,
            skip: (page - 1) * pageSize,
            take: pageSize,
            orderBy: [{ inicio: "desc" }],
            select: visitaSelect,
        }),
    ]);
    return res.json({
        page,
        pageSize,
        total,
        totalPages: Math.max(1, Math.ceil(total / pageSize)),
        items: rows,
    });
};
/* ------------------------------------ */
/* Get por ID                            */
/* ------------------------------------ */
export const getVisitaById = async (req, res) => {
    const id = parseId(req.params.id);
    if (!id)
        return res.status(400).json({ error: "id inválido" });
    const row = await prisma.visita.findUnique({ where: { id_visita: id }, select: visitaSelect });
    if (!row)
        return res.status(404).json({ error: "Visita no encontrada" });
    const user = req.user;
    if (user?.rol === "CLIENTE" && row.empresaId !== user.empresaId) {
        return res.status(403).json({ error: "No autorizado" });
    }
    return res.json(row);
};
/* ------------------------------------ */
/* Crear (single o lote)                 */
/* ------------------------------------ */
export const createVisita = async (req, res) => {
    try {
        const payload = CreateVisitaSchema.parse(req.body);
        // ¿Lote?
        const isBatch = (payload.solicitantesIds && payload.solicitantesIds.length > 0) ||
            (payload.solicitantesNombres && payload.solicitantesNombres.length > 0);
        // Datos comunes para todas las visitas
        const commonData = {
            empresaId: payload.empresaId,
            tecnicoId: payload.tecnicoId,
            direccion_visita: payload.direccion_visita ?? null, // ✅
            sucursalId: payload.sucursalId ?? null,
            inicio: payload.inicio,
            fin: payload.fin ?? null,
            status: payload.status ?? "PENDIENTE",
            confImpresoras: !!payload.confImpresoras,
            confTelefonos: !!payload.confTelefonos,
            confPiePagina: !!payload.confPiePagina,
            otros: !!payload.otros,
            otrosDetalle: payload.otros ? (payload.otrosDetalle ?? null) : null,
            actualizaciones: !!payload.actualizaciones,
            antivirus: !!payload.antivirus,
            ccleaner: !!payload.ccleaner,
            estadoDisco: !!payload.estadoDisco,
            licenciaOffice: !!payload.licenciaOffice,
            licenciaWindows: !!payload.licenciaWindows,
            mantenimientoReloj: !!payload.mantenimientoReloj,
            rendimientoEquipo: !!payload.rendimientoEquipo,
        };
        if (!isBatch) {
            // ===== MODO "UNO" (compatibilidad)
            let solicitante = payload.solicitante?.trim();
            let solicitanteId = payload.solicitanteId ?? null;
            if (!solicitante && solicitanteId) {
                const s = await prisma.solicitante.findUnique({
                    where: { id_solicitante: solicitanteId },
                    select: { nombre: true },
                });
                if (!s)
                    return res.status(400).json({ error: "solicitanteId no existe" });
                solicitante = s.nombre;
            }
            if (!solicitante) {
                return res.status(400).json({ error: "Debe indicar 'solicitante' o 'solicitanteId' válido" });
            }
            const created = await prisma.visita.create({
                data: { ...commonData, solicitanteId, solicitante },
                select: visitaSelect,
            });
            return res.status(201).json(created);
        }
        // ===== MODO "LOTE"
        // 1) Resolver los que llegan por ID
        let resolvedFromIds = [];
        if (payload.solicitantesIds?.length) {
            const rows = await prisma.solicitante.findMany({
                where: { id_solicitante: { in: payload.solicitantesIds } },
                select: { id_solicitante: true, nombre: true },
            });
            const foundIds = new Set(rows.map(r => r.id_solicitante));
            const missing = payload.solicitantesIds.filter(id => !foundIds.has(id));
            if (missing.length) {
                return res.status(400).json({ error: "Algunos solicitantesId no existen", missing });
            }
            resolvedFromIds = rows.map(r => ({ solicitanteId: r.id_solicitante, solicitante: r.nombre }));
        }
        // 2) Resolver los que llegan por nombre
        const fromNames = (payload.solicitantesNombres ?? [])
            .map(n => n.trim())
            .filter(n => n.length > 0)
            .map(n => ({ solicitanteId: null, solicitante: n }));
        // 3) Mezclar y deduplicar (por id+nombre)
        const allTargets = [];
        const seen = new Set();
        for (const r of [...resolvedFromIds, ...fromNames]) {
            const key = `${r.solicitanteId ?? "null"}|${r.solicitante.toLowerCase()}`;
            if (!seen.has(key)) {
                seen.add(key);
                allTargets.push(r);
            }
        }
        if (allTargets.length === 0) {
            return res.status(400).json({ error: "No hay solicitantes válidos para crear visitas" });
        }
        // 4) Crear todas en transacción
        const createdList = await prisma.$transaction(allTargets.map(t => prisma.visita.create({
            data: {
                ...commonData,
                solicitanteId: t.solicitanteId,
                solicitante: t.solicitante,
            },
            select: visitaSelect,
        })));
        return res.status(201).json({ createdCount: createdList.length, visitas: createdList });
    }
    catch (err) {
        if (err instanceof z.ZodError) {
            return res.status(400).json({ error: "Datos inválidos", details: err.flatten() });
        }
        console.error("[visitas.create] error:", err);
        return res.status(500).json({ error: "No se pudo crear la(s) visita(s)" });
    }
};
/* ------------------------------------ */
/* Actualizar (PUT/PATCH)                */
/* ------------------------------------ */
export const updateVisita = async (req, res) => {
    const id = parseId(req.params.id);
    if (!id)
        return res.status(400).json({ error: "id inválido" });
    try {
        const payload = UpdateVisitaSchema.parse(req.body);
        let solicitanteToSet = payload.solicitante;
        if (payload.solicitanteId !== undefined && solicitanteToSet === undefined) {
            const s = await prisma.solicitante.findUnique({
                where: { id_solicitante: payload.solicitanteId },
                select: { nombre: true },
            });
            if (!s)
                return res.status(400).json({ error: "solicitanteId no existe" });
            solicitanteToSet = s.nombre;
        }
        // coherencia de 'otrosDetalle'
        const otrosDetalle = payload.otros === undefined
            ? payload.otrosDetalle
            : payload.otros
                ? payload.otrosDetalle ?? null
                : null;
        const updated = await prisma.visita.update({
            where: { id_visita: id },
            data: {
                ...(payload.empresaId !== undefined ? { empresaId: payload.empresaId } : {}),
                ...(payload.tecnicoId !== undefined ? { tecnicoId: payload.tecnicoId } : {}),
                ...(payload.direccion_visita !== undefined ? { direccion_visita: payload.direccion_visita } : {}),
                ...(payload.sucursalId !== undefined ? { sucursalId: payload.sucursalId } : {}),
                ...(payload.solicitanteId !== undefined ? { solicitanteId: payload.solicitanteId } : {}),
                ...(solicitanteToSet !== undefined ? { solicitante: solicitanteToSet } : {}),
                ...(payload.inicio !== undefined ? { inicio: payload.inicio } : {}),
                ...(payload.fin !== undefined ? { fin: payload.fin } : {}),
                ...(payload.status !== undefined ? { status: payload.status } : {}),
                ...(payload.confImpresoras !== undefined ? { confImpresoras: !!payload.confImpresoras } : {}),
                ...(payload.confTelefonos !== undefined ? { confTelefonos: !!payload.confTelefonos } : {}),
                ...(payload.confPiePagina !== undefined ? { confPiePagina: !!payload.confPiePagina } : {}),
                ...(payload.otros !== undefined ? { otros: !!payload.otros } : {}),
                ...(otrosDetalle !== undefined ? { otrosDetalle } : {}),
                ...(payload.actualizaciones !== undefined ? { actualizaciones: !!payload.actualizaciones } : {}),
                ...(payload.antivirus !== undefined ? { antivirus: !!payload.antivirus } : {}),
                ...(payload.ccleaner !== undefined ? { ccleaner: !!payload.ccleaner } : {}),
                ...(payload.estadoDisco !== undefined ? { estadoDisco: !!payload.estadoDisco } : {}),
                ...(payload.licenciaOffice !== undefined ? { licenciaOffice: !!payload.licenciaOffice } : {}),
                ...(payload.licenciaWindows !== undefined ? { licenciaWindows: !!payload.licenciaWindows } : {}),
                ...(payload.mantenimientoReloj !== undefined ? { mantenimientoReloj: !!payload.mantenimientoReloj } : {}),
                ...(payload.rendimientoEquipo !== undefined ? { rendimientoEquipo: !!payload.rendimientoEquipo } : {}),
            },
            select: visitaSelect,
        });
        return res.json(updated);
    }
    catch (err) {
        if (err instanceof z.ZodError) {
            return res.status(400).json({ error: "Datos inválidos", details: err.flatten() });
        }
        if (err?.code === "P2025") {
            return res.status(404).json({ error: "Visita no encontrada" });
        }
        console.error("[visitas.update] error:", err);
        return res.status(500).json({ error: "No se pudo actualizar la visita" });
    }
};
/* ------------------------------------ */
/* Eliminar                              */
/* ------------------------------------ */
export const deleteVisita = async (req, res) => {
    const id = parseId(req.params.id);
    if (!id)
        return res.status(400).json({ error: "id inválido" });
    try {
        await prisma.visita.delete({ where: { id_visita: id } });
        return res.status(204).send();
    }
    catch (err) {
        if (err?.code === "P2025") {
            return res.status(404).json({ error: "Visita no encontrada" });
        }
        console.error("[visitas.delete] error:", err);
        return res.status(500).json({ error: "No se pudo eliminar la visita" });
    }
};
/* ------------------------------------ */
/* Métricas (existentes)                 */
/* ------------------------------------ */
export const getVisitasMetrics = async (req, res) => {
    try {
        const fromQ = req.query.from?.trim();
        const toQ = req.query.to?.trim();
        const now = new Date();
        const y = now.getFullYear();
        const m = now.getMonth();
        const startDefault = new Date(y, m, 1);
        const endDefault = new Date(y, m + 1, 1);
        const from = fromQ ? new Date(fromQ) : startDefault;
        const to = toQ ? new Date(toQ) : endDefault;
        const total = await prisma.visita.count({
            where: { inicio: { gte: from, lt: to } },
        });
        const grouped = await prisma.visita.groupBy({
            by: ["tecnicoId"],
            where: { inicio: { gte: from, lt: to } },
            _count: { _all: true },
        });
        const tecnicoIds = grouped.map((g) => g.tecnicoId);
        const tecnicos = tecnicoIds.length
            ? await prisma.tecnico.findMany({
                where: { id_tecnico: { in: tecnicoIds } },
                select: { id_tecnico: true, nombre: true },
            })
            : [];
        const nameById = new Map(tecnicos.map((t) => [t.id_tecnico, t.nombre]));
        const porTecnico = grouped
            .map((g) => ({
            tecnicoId: g.tecnicoId,
            tecnico: nameById.get(g.tecnicoId) ?? `Técnico ${g.tecnicoId}`,
            cantidad: g._count._all,
        }))
            .sort((a, b) => b.cantidad - a.cantidad);
        return res.json({ total, porTecnico });
    }
    catch (err) {
        console.error("[visitas.metrics] error:", err);
        return res
            .status(500)
            .json({ error: "No se pudieron obtener métricas de visitas" });
    }
};
// Alias por compatibilidad
export const visitasMetrics = async (req, res) => {
    const from = new Date(`${req.query.from}T00:00:00`);
    const to = new Date(`${req.query.to}T00:00:00`);
    const total = await prisma.visita.count({
        where: { inicio: { gte: from, lt: to } },
    });
    const rows = await prisma.visita.groupBy({
        by: ["tecnicoId"],
        where: { inicio: { gte: from, lt: to } },
        _count: { _all: true },
    });
    const tecnicos = await prisma.tecnico.findMany({
        where: { id_tecnico: { in: rows.map((r) => r.tecnicoId) } },
        select: { id_tecnico: true, nombre: true },
    });
    const techMap = new Map(tecnicos.map((t) => [t.id_tecnico, t.nombre]));
    const porTecnicoEmpresaRaw = await prisma.visita.groupBy({
        by: ["tecnicoId", "empresaId"],
        where: { inicio: { gte: from, lt: to } },
        _count: { _all: true },
    });
    const empresas = await prisma.empresa.findMany({
        where: { id_empresa: { in: porTecnicoEmpresaRaw.map((r) => r.empresaId) } },
        select: { id_empresa: true, nombre: true },
    });
    const empresaMap = new Map(empresas.map((e) => [e.id_empresa, e.nombre]));
    const empresasByTech = new Map();
    for (const r of porTecnicoEmpresaRaw) {
        const list = empresasByTech.get(r.tecnicoId) ?? [];
        list.push({
            empresaId: r.empresaId,
            empresa: empresaMap.get(r.empresaId) ?? `Empresa ${r.empresaId}`,
            cantidad: r._count._all,
        });
        empresasByTech.set(r.tecnicoId, list);
    }
    const porTecnico = rows
        .map((r) => ({
        tecnicoId: r.tecnicoId,
        tecnico: techMap.get(r.tecnicoId) ?? `Técnico ${r.tecnicoId}`,
        cantidad: r._count._all,
        empresas: (empresasByTech.get(r.tecnicoId) ?? []).sort((a, b) => b.cantidad - a.cantidad),
    }))
        .sort((a, b) => b.cantidad - a.cantidad);
    res.json({ total, porTecnico });
};
/* ------------------------------------ */
/* Filtros                               */
/* ------------------------------------ */
export const getVisitasFilters = async (_req, res) => {
    const [tecnicos, empresas] = await Promise.all([
        prisma.tecnico.findMany({
            orderBy: { nombre: "asc" },
            select: { id_tecnico: true, nombre: true },
        }),
        prisma.empresa.findMany({
            orderBy: { nombre: "asc" },
            select: { id_empresa: true, nombre: true },
        }),
    ]);
    res.json({
        tecnicos: tecnicos.map((t) => ({ id: t.id_tecnico, nombre: t.nombre })),
        empresas: empresas.map((e) => ({ id: e.id_empresa, nombre: e.nombre })),
    });
};
/* ------------------------------------ */
/* Acciones rápidas                      */
/* ------------------------------------ */
export const closeVisita = async (req, res) => {
    const id = parseId(req.params.id);
    if (!id)
        return res.status(400).json({ error: "id inválido" });
    try {
        const updated = await prisma.visita.update({
            where: { id_visita: id },
            data: { status: "COMPLETADA", fin: new Date() },
            select: visitaSelect,
        });
        return res.json(updated);
    }
    catch (err) {
        if (err?.code === "P2025") {
            return res.status(404).json({ error: "Visita no encontrada" });
        }
        console.error("[visitas.close] error:", err);
        return res.status(500).json({ error: "No se pudo cerrar la visita" });
    }
};
function getDuracionMinutos(inicio, fin) {
    if (!inicio || !fin)
        return 0;
    const ini = new Date(inicio).getTime();
    const end = new Date(fin).getTime();
    if (Number.isNaN(ini) || Number.isNaN(end) || end <= ini)
        return 0;
    return Math.round((end - ini) / 60000);
}
export const getVisitasDashboard = async (req, res) => {
    try {
        const fromQ = req.query.fromDate;
        const toQ = req.query.toDate;
        const empresaIdQ = req.query.empresaId;
        const user = req.user;
        const empresaIdForzada = user?.rol === "CLIENTE" ? user.empresaId : undefined;
        const where = {
            ...(empresaIdForzada
                ? { empresaId: empresaIdForzada }
                : empresaIdQ ? { empresaId: Number(empresaIdQ) } : {}),
            ...(fromQ || toQ ? {
                inicio: {
                    ...(fromQ ? { gte: new Date(fromQ) } : {}),
                    ...(toQ ? { lte: new Date(toQ) } : {}),
                }
            } : {}),
        };
        const visitas = await prisma.visita.findMany({
            where,
            select: {
                id_visita: true,
                inicio: true,
                fin: true,
                status: true,
                empresaId: true,
                empresa: { select: { id_empresa: true, nombre: true } },
                tecnico: { select: { id_tecnico: true, nombre: true } },
            },
            orderBy: { inicio: "asc" },
        });
        // ─── AGRUPAR POR JORNADA (tecnico + inicio + fin) ───────────────────
        // Evita multiplicar horas cuando hay N solicitantes en la misma visita
        const jornadasMap = new Map();
        for (const v of visitas) {
            const tecnico = v.tecnico?.nombre?.trim() || "Sin técnico";
            const inicioStr = v.inicio ? new Date(v.inicio).toISOString() : "?";
            const finStr = v.fin ? new Date(v.fin).toISOString() : "null";
            const key = `${tecnico}|${inicioStr}|${finStr}`;
            if (!jornadasMap.has(key)) {
                jornadasMap.set(key, {
                    inicio: v.inicio,
                    fin: v.fin ?? null,
                    tecnico,
                    empresa: v.empresa?.nombre ?? `#${v.empresaId}`,
                    empresaId: v.empresaId ?? null,
                    status: v.status,
                });
            }
        }
        const jornadas = Array.from(jornadasMap.values());
        // ─── KPIs sobre jornadas únicas ──────────────────────────────────────
        const totalJornadas = jornadas.length;
        const duraciones = jornadas.map((j) => getDuracionMinutos(j.inicio, j.fin));
        const totalMinutos = duraciones.reduce((acc, n) => acc + n, 0);
        const totalHoras = Number((totalMinutos / 60).toFixed(1));
        const promedioMinutosPorJornada = totalJornadas > 0
            ? Math.round(totalMinutos / totalJornadas)
            : 0;
        const maximaDuracionMinutos = duraciones.length ? Math.max(...duraciones) : 0;
        const diasConVisitas = new Set(jornadas
            .filter((j) => j.inicio)
            .map((j) => new Date(j.inicio).toISOString().slice(0, 10))).size;
        const promedioHorasPorDia = diasConVisitas > 0
            ? Number((totalHoras / diasConVisitas).toFixed(1))
            : 0;
        // Status sigue usando visitas individuales (correcto: 1 por solicitante)
        const completadas = visitas.filter(v => v.status === "COMPLETADA").length;
        const pendientes = visitas.filter(v => v.status === "PENDIENTE").length;
        const canceladas = visitas.filter(v => v.status === "CANCELADA").length;
        // ─── porMes sobre jornadas ───────────────────────────────────────────
        const porMesMap = new Map();
        for (const j of jornadas) {
            if (!j.inicio)
                continue;
            const fecha = new Date(j.inicio);
            if (Number.isNaN(fecha.getTime()))
                continue;
            const mes = `${fecha.getFullYear()}-${String(fecha.getMonth() + 1).padStart(2, "0")}`;
            const minutos = getDuracionMinutos(j.inicio, j.fin);
            if (!porMesMap.has(mes))
                porMesMap.set(mes, { mes, visitas: 0, minutos: 0 });
            const row = porMesMap.get(mes);
            row.visitas += 1;
            row.minutos += minutos;
        }
        const porMes = Array.from(porMesMap.values()).sort((a, b) => a.mes.localeCompare(b.mes));
        // ─── porDia sobre jornadas ───────────────────────────────────────────
        const porDiaMap = new Map();
        for (const j of jornadas) {
            if (!j.inicio)
                continue;
            const fecha = new Date(j.inicio).toISOString().slice(0, 10);
            const minutos = getDuracionMinutos(j.inicio, j.fin);
            if (!porDiaMap.has(fecha))
                porDiaMap.set(fecha, { fecha, visitas: 0, minutos: 0 });
            const row = porDiaMap.get(fecha);
            row.visitas += 1;
            row.minutos += minutos;
        }
        const porDia = Array.from(porDiaMap.values()).sort((a, b) => a.fecha.localeCompare(b.fecha));
        // ─── porTecnico sobre jornadas con detalle mensual ───────────────────────
        const porTecnicoFullMap = new Map();
        for (const j of jornadas) {
            const minutos = getDuracionMinutos(j.inicio, j.fin);
            const fecha = new Date(j.inicio);
            if (Number.isNaN(fecha.getTime()))
                continue;
            const dia = fecha.toISOString().slice(0, 10);
            const mes = `${fecha.getFullYear()}-${String(fecha.getMonth() + 1).padStart(2, "0")}`;
            if (!porTecnicoFullMap.has(j.tecnico)) {
                porTecnicoFullMap.set(j.tecnico, {
                    tecnico: j.tecnico,
                    jornadas: 0,
                    minutos: 0,
                    diasUnicos: new Set(),
                    mesesMap: new Map(),
                });
            }
            const tec = porTecnicoFullMap.get(j.tecnico);
            tec.jornadas++;
            tec.minutos += minutos;
            tec.diasUnicos.add(dia);
            if (!tec.mesesMap.has(mes)) {
                tec.mesesMap.set(mes, { mes, jornadas: 0, minutos: 0, diasUnicos: new Set() });
            }
            const mesRow = tec.mesesMap.get(mes);
            mesRow.jornadas++;
            mesRow.minutos += minutos;
            mesRow.diasUnicos.add(dia);
        }
        const porTecnicoChart = Array.from(porTecnicoFullMap.values())
            .map((tec) => ({
            tecnico: tec.tecnico,
            visitas: tec.jornadas,
            minutos: tec.minutos,
            horas: Number((tec.minutos / 60).toFixed(1)),
            diasConVisitas: tec.diasUnicos.size,
            meses: Array.from(tec.mesesMap.values())
                .map((m) => ({
                mes: m.mes,
                jornadas: m.jornadas,
                minutos: m.minutos,
                horas: Number((m.minutos / 60).toFixed(1)),
                diasConVisitas: m.diasUnicos.size,
            }))
                .sort((a, b) => a.mes.localeCompare(b.mes)),
        }))
            .sort((a, b) => b.minutos - a.minutos);
        // ─── porEmpresa sobre JORNADAS (horas reales) ───────────────────────────
        const porEmpresaMap = new Map();
        for (const j of jornadas) {
            const empresa = j.empresa;
            const fecha = new Date(j.inicio);
            if (Number.isNaN(fecha.getTime()))
                continue;
            const dia = fecha.toISOString().slice(0, 10);
            const mes = `${fecha.getFullYear()}-${String(fecha.getMonth() + 1).padStart(2, "0")}`;
            const minutos = getDuracionMinutos(j.inicio, j.fin);
            if (!porEmpresaMap.has(empresa)) {
                porEmpresaMap.set(empresa, {
                    nombre: empresa,
                    jornadas: 0,
                    minutos: 0,
                    diasUnicos: new Set(),
                    mesesMap: new Map(),
                });
            }
            const emp = porEmpresaMap.get(empresa);
            emp.jornadas++;
            emp.minutos += minutos;
            emp.diasUnicos.add(dia);
            if (!emp.mesesMap.has(mes)) {
                emp.mesesMap.set(mes, { mes, jornadas: 0, minutos: 0, diasUnicos: new Set() });
            }
            const mesRow = emp.mesesMap.get(mes);
            mesRow.jornadas++;
            mesRow.minutos += minutos;
            mesRow.diasUnicos.add(dia);
        }
        const porEmpresa = Array.from(porEmpresaMap.values())
            .map((emp) => ({
            nombre: emp.nombre,
            jornadas: emp.jornadas,
            minutos: emp.minutos,
            horas: Number((emp.minutos / 60).toFixed(1)),
            diasConVisitas: emp.diasUnicos.size,
            meses: Array.from(emp.mesesMap.values())
                .map((m) => ({
                mes: m.mes,
                jornadas: m.jornadas,
                minutos: m.minutos,
                horas: Number((m.minutos / 60).toFixed(1)),
                diasConVisitas: m.diasUnicos.size,
            }))
                .sort((a, b) => a.mes.localeCompare(b.mes)),
        }))
            .sort((a, b) => b.minutos - a.minutos);
        return res.json({
            kpis: {
                totalVisitas: visitas.length,
                totalJornadas,
                completadas,
                pendientes,
                canceladas,
                diasConVisitas,
                totalMinutos,
                totalHoras,
                promedioMinutosPorJornada,
                promedioHorasPorDia,
                maximaDuracionMinutos,
            },
            charts: {
                porMes,
                porDia,
                porTecnico: porTecnicoChart,
                porEmpresa
            },
        });
    }
    catch (err) {
        console.error("[visitas.dashboard] error:", err);
        return res.status(500).json({ error: "No se pudo obtener el dashboard de visitas" });
    }
};
//# sourceMappingURL=visitas.controller.js.map