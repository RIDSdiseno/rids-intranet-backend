import { Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma.js";
import { z } from "zod";
import { DateTime } from "luxon";
/* ------------------------------------ */
/* Helpers comunes                       */
/* ------------------------------------ */
function parseLocalDateTime(value) {
    if (!value)
        return null;
    const str = typeof value === "string" ? value : value.toISOString();
    // Si ya viene con timezone explícito (Z o +HH:MM), respetar tal cual
    if (str.endsWith("Z") || /[+-]\d{2}:\d{2}$/.test(str)) {
        return new Date(str);
    }
    // Sin timezone → asumir hora de Santiago y convertir a UTC
    const dt = DateTime.fromISO(str, { zone: "America/Santiago" });
    if (!dt.isValid)
        return null;
    return dt.toJSDate();
}
function obtenerFechaChile(fecha) {
    const dateTime = fecha instanceof Date
        ? DateTime.fromJSDate(fecha, {
            zone: "utc",
        })
        : DateTime.fromISO(fecha, {
            zone: "utc",
        });
    return dateTime
        .setZone("America/Santiago")
        .toFormat("yyyy-MM-dd");
}
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
    agendaId: true,
    origen: true,
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
const agendaResumenSelect = {
    id: true,
    fecha: true,
    estado: true,
    horaInicio: true,
    horaFin: true,
    fechaInicioRuta: true,
    fechaInicioVisita: true,
    empresaExternaNombre: true,
    empresa: { select: { id_empresa: true, nombre: true } },
    tecnicos: {
        include: {
            tecnico: { select: { id_tecnico: true, nombre: true } },
        },
    },
};
async function adjuntarAgendaResumen(rows) {
    const agendaIds = Array.from(new Set(rows
        .map((row) => row.agendaId)
        .filter((agendaId) => typeof agendaId === "number")));
    if (agendaIds.length === 0) {
        return rows.map((row) => ({ ...row, agenda: null }));
    }
    const agendas = await prisma.agendaVisita.findMany({
        where: { id: { in: agendaIds } },
        select: agendaResumenSelect,
    });
    const agendasPorId = new Map(agendas.map((agenda) => [agenda.id, agenda]));
    return rows.map((row) => ({
        ...row,
        agenda: row.agendaId ? agendasPorId.get(row.agendaId) ?? null : null,
    }));
}
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
    inicio: z.string(),
    fin: z.string().optional().nullable(),
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
    inicio: z.string().optional(),
    fin: z.string().optional().nullable(),
    status: StatusEnum.optional(),
})
    .extend(baseFlags.partial().shape);
const parseId = (raw) => {
    const n = Number(raw);
    return Number.isInteger(n) && n > 0 ? n : null;
};
const buildVisitaEmpresaActivaWhere = () => ({
    empresa: {
        is: {
            isActive: true,
        },
    },
});
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
        AND: [
            buildVisitaEmpresaActivaWhere(),
            user?.rol === "CLIENTE"
                ? {
                    empresaId: Number(user.empresaId),
                }
                : empresaIdQ
                    ? {
                        empresaId: Number(empresaIdQ),
                    }
                    : {},
            tecnicoIdQ
                ? {
                    tecnicoId: Number(tecnicoIdQ),
                }
                : {},
            statusQ
                ? {
                    status: statusQ,
                }
                : {},
            dateFilter
                ? {
                    inicio: dateFilter,
                }
                : {},
            q
                ? {
                    OR: [
                        {
                            solicitante: {
                                contains: q,
                                mode: INS,
                            },
                        },
                        {
                            otrosDetalle: {
                                contains: q,
                                mode: INS,
                            },
                        },
                        {
                            empresa: {
                                is: {
                                    nombre: {
                                        contains: q,
                                        mode: INS,
                                    },
                                },
                            },
                        },
                        {
                            tecnico: {
                                is: {
                                    nombre: {
                                        contains: q,
                                        mode: INS,
                                    },
                                },
                            },
                        },
                        {
                            solicitanteRef: {
                                is: {
                                    nombre: {
                                        contains: q,
                                        mode: INS,
                                    },
                                },
                            },
                        },
                    ],
                }
                : {},
        ],
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
    const items = await adjuntarAgendaResumen(rows);
    return res.json({
        page,
        pageSize,
        total,
        totalPages: Math.max(1, Math.ceil(total / pageSize)),
        items,
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
    const [visita] = await adjuntarAgendaResumen([row]);
    return res.json(visita);
};
/* ------------------------------------ */
/* Crear (single o lote)                 */
/* ------------------------------------ */
export const createVisita = async (req, res) => {
    try {
        const payload = CreateVisitaSchema.parse(req.body);
        const empresa = await prisma.empresa.findUnique({
            where: {
                id_empresa: payload.empresaId,
            },
            select: {
                id_empresa: true,
                isActive: true,
            },
        });
        if (!empresa) {
            return res.status(404).json({
                error: "La empresa no existe",
            });
        }
        if (!empresa.isActive) {
            return res.status(409).json({
                code: "EMPRESA_INACTIVA",
                error: "La empresa está inactiva y no puede recibir nuevas visitas.",
            });
        }
        // ¿Lote?
        const isBatch = (payload.solicitantesIds && payload.solicitantesIds.length > 0) ||
            (payload.solicitantesNombres && payload.solicitantesNombres.length > 0);
        const inicioDate = parseLocalDateTime(payload.inicio);
        if (!inicioDate)
            return res.status(400).json({ error: "Fecha de inicio inválida" });
        // Datos comunes para todas las visitas
        const commonData = {
            empresaId: payload.empresaId,
            tecnicoId: payload.tecnicoId,
            direccion_visita: payload.direccion_visita ?? null, // ✅
            sucursalId: payload.sucursalId ?? null,
            inicio: inicioDate,
            fin: parseLocalDateTime(payload.fin ?? null),
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
        const otrosDetalle = payload.otros === undefined
            ? payload.otrosDetalle
            : payload.otros
                ? payload.otrosDetalle ?? null
                : null;
        // Construir data como Record para evitar conflicto con exactOptionalPropertyTypes
        const data = {};
        if (payload.empresaId !== undefined)
            data.empresaId = payload.empresaId;
        if (payload.tecnicoId !== undefined)
            data.tecnicoId = payload.tecnicoId;
        if (payload.direccion_visita !== undefined)
            data.direccion_visita = payload.direccion_visita;
        if (payload.sucursalId !== undefined)
            data.sucursalId = payload.sucursalId;
        if (payload.solicitanteId !== undefined)
            data.solicitanteId = payload.solicitanteId;
        if (solicitanteToSet !== undefined)
            data.solicitante = solicitanteToSet;
        if (payload.inicio !== undefined)
            data.inicio = parseLocalDateTime(payload.inicio);
        if (payload.fin !== undefined)
            data.fin = parseLocalDateTime(payload.fin ?? null);
        if (payload.status !== undefined)
            data.status = payload.status;
        if (payload.confImpresoras !== undefined)
            data.confImpresoras = !!payload.confImpresoras;
        if (payload.confTelefonos !== undefined)
            data.confTelefonos = !!payload.confTelefonos;
        if (payload.confPiePagina !== undefined)
            data.confPiePagina = !!payload.confPiePagina;
        if (payload.otros !== undefined)
            data.otros = !!payload.otros;
        if (otrosDetalle !== undefined)
            data.otrosDetalle = otrosDetalle;
        if (payload.actualizaciones !== undefined)
            data.actualizaciones = !!payload.actualizaciones;
        if (payload.antivirus !== undefined)
            data.antivirus = !!payload.antivirus;
        if (payload.ccleaner !== undefined)
            data.ccleaner = !!payload.ccleaner;
        if (payload.estadoDisco !== undefined)
            data.estadoDisco = !!payload.estadoDisco;
        if (payload.licenciaOffice !== undefined)
            data.licenciaOffice = !!payload.licenciaOffice;
        if (payload.licenciaWindows !== undefined)
            data.licenciaWindows = !!payload.licenciaWindows;
        if (payload.mantenimientoReloj !== undefined)
            data.mantenimientoReloj = !!payload.mantenimientoReloj;
        if (payload.rendimientoEquipo !== undefined)
            data.rendimientoEquipo = !!payload.rendimientoEquipo;
        const updated = await prisma.visita.update({
            where: { id_visita: id },
            data,
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
            where: {
                inicio: {
                    gte: from,
                    lt: to,
                },
                empresa: {
                    is: {
                        isActive: true,
                    },
                },
            },
        });
        const grouped = await prisma.visita.groupBy({
            by: ["tecnicoId"],
            where: {
                inicio: {
                    gte: from,
                    lt: to,
                },
                empresa: {
                    is: {
                        isActive: true,
                    },
                },
            },
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
        where: {
            inicio: { gte: from, lt: to },
            empresa: {
                is: {
                    isActive: true,
                },
            },
        },
    });
    const rows = await prisma.visita.groupBy({
        by: ["tecnicoId"],
        where: {
            inicio: { gte: from, lt: to }, empresa: {
                is: {
                    isActive: true,
                },
            },
        },
        _count: { _all: true },
    });
    const tecnicos = await prisma.tecnico.findMany({
        where: { id_tecnico: { in: rows.map((r) => r.tecnicoId) } },
        select: { id_tecnico: true, nombre: true },
    });
    const techMap = new Map(tecnicos.map((t) => [t.id_tecnico, t.nombre]));
    const porTecnicoEmpresaRaw = await prisma.visita.groupBy({
        by: ["tecnicoId", "empresaId"],
        where: {
            inicio: { gte: from, lt: to }, empresa: {
                is: {
                    isActive: true,
                },
            },
        },
        _count: { _all: true },
    });
    const empresas = await prisma.empresa.findMany({
        where: {
            id_empresa: {
                in: porTecnicoEmpresaRaw.map((r) => r.empresaId),
            },
            isActive: true,
        },
        select: {
            id_empresa: true,
            nombre: true,
        },
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
            where: {
                status: true,
                rol: {
                    in: ["ADMIN", "ADMINISTRACION", "TECNICO", "VENTAS"],
                },
            },
            orderBy: { nombre: "asc" },
            select: {
                id_tecnico: true,
                nombre: true,
                email: true,
                rol: true,
                status: true,
            },
        }),
        prisma.empresa.findMany({
            where: {
                isActive: true,
            },
            orderBy: {
                nombre: "asc",
            },
            select: {
                id_empresa: true,
                nombre: true,
            },
        }),
    ]);
    res.json({
        tecnicos: tecnicos.map((t) => ({
            id: t.id_tecnico,
            nombre: t.nombre,
            email: t.email,
            rol: t.rol,
            status: t.status,
        })),
        empresas: empresas.map((e) => ({
            id: e.id_empresa,
            nombre: e.nombre,
        })),
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
            empresa: {
                is: {
                    isActive: true,
                },
            },
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
        const visitasParaJornadas = visitas.filter((v) => {
            const status = String(v.status ?? "").toUpperCase();
            return (status === "COMPLETADA" &&
                v.inicio &&
                v.fin &&
                new Date(v.fin).getTime() > new Date(v.inicio).getTime());
        });
        for (const v of visitasParaJornadas) {
            const tecnico = v.tecnico?.nombre?.trim() || "Sin técnico";
            const inicioStr = v.inicio ? new Date(v.inicio).toISOString() : "?";
            const finStr = v.fin ? new Date(v.fin).toISOString() : "null";
            const key = `${v.empresaId ?? "sin_empresa"}|${tecnico}|${inicioStr}|${finStr}`;
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
/* ------------------------------------ */
/* Agenda y atenciones por día           */
/* ------------------------------------ */
export const getVisitasResumenDiario = async (req, res) => {
    try {
        const fechaDesdeTexto = String(req.query.fechaDesde ?? "").trim();
        const fechaHastaTexto = String(req.query.fechaHasta ?? "").trim();
        const formatoFecha = /^\d{4}-\d{2}-\d{2}$/;
        if (!formatoFecha.test(fechaDesdeTexto) ||
            !formatoFecha.test(fechaHastaTexto)) {
            return res.status(400).json({
                error: "Debe enviar fechaDesde y fechaHasta en formato YYYY-MM-DD.",
            });
        }
        const fechaDesdeChile = DateTime.fromISO(fechaDesdeTexto, {
            zone: "America/Santiago",
        });
        const fechaHastaChile = DateTime.fromISO(fechaHastaTexto, {
            zone: "America/Santiago",
        });
        if (!fechaDesdeChile.isValid ||
            !fechaHastaChile.isValid) {
            return res.status(400).json({
                error: "El rango de fechas no es válido.",
            });
        }
        if (fechaDesdeChile.startOf("day").toMillis() >
            fechaHastaChile.startOf("day").toMillis()) {
            return res.status(400).json({
                error: "La fecha desde no puede ser posterior a la fecha hasta.",
            });
        }
        const diasConsultados = Math.floor(fechaHastaChile
            .startOf("day")
            .diff(fechaDesdeChile.startOf("day"), "days").days) + 1;
        if (diasConsultados > 31) {
            return res.status(400).json({
                error: "El periodo máximo permitido es de 31 días.",
            });
        }
        /*
          Para Visita.inicio se consulta el día completo de Chile
          convertido a UTC.
    
          Ejemplo:
          2026-07-15 00:00 Chile
          hasta
          2026-07-16 00:00 Chile
        */
        const inicioVisitasUtc = fechaDesdeChile
            .startOf("day")
            .toUTC()
            .toJSDate();
        const finVisitasUtc = fechaHastaChile
            .plus({ days: 1 })
            .startOf("day")
            .toUTC()
            .toJSDate();
        /*
          AgendaVisita.fecha es @db.Date y se trabaja en tu servicio
          como medianoche UTC.
        */
        const inicioAgendaUtc = new Date(Date.UTC(fechaDesdeChile.year, fechaDesdeChile.month - 1, fechaDesdeChile.day));
        const finAgendaUtc = new Date(Date.UTC(fechaHastaChile.year, fechaHastaChile.month - 1, fechaHastaChile.day, 23, 59, 59, 999));
        const tecnicoIdQ = parseId(req.query.tecnicoId);
        const empresaIdQ = parseId(req.query.empresaId);
        const user = req.user;
        const empresaIdForzada = user?.rol === "CLIENTE"
            ? Number(user.empresaId)
            : empresaIdQ;
        const [agendas, atenciones] = await Promise.all([
            prisma.agendaVisita.findMany({
                where: {
                    fecha: {
                        gte: inicioAgendaUtc,
                        lte: finAgendaUtc,
                    },
                    /*
                      No se muestran asignaciones canceladas como programación
                      vigente del técnico.
                    */
                    estado: {
                        not: "CANCELADA",
                    },
                    ...(empresaIdForzada
                        ? {
                            empresaId: empresaIdForzada,
                            empresa: {
                                is: {
                                    isActive: true,
                                },
                            },
                        }
                        : {
                            OR: [
                                {
                                    empresaId: null,
                                },
                                {
                                    empresa: {
                                        is: {
                                            isActive: true,
                                        },
                                    },
                                },
                            ],
                        }),
                    ...(tecnicoIdQ
                        ? {
                            tecnicos: {
                                some: {
                                    tecnicoId: tecnicoIdQ,
                                },
                            },
                        }
                        : {}),
                },
                select: {
                    id: true,
                    fecha: true,
                    tipo: true,
                    estado: true,
                    empresaId: true,
                    empresaExternaNombre: true,
                    horaInicio: true,
                    horaFin: true,
                    notas: true,
                    mensaje: true,
                    empresa: {
                        select: {
                            id_empresa: true,
                            nombre: true,
                        },
                    },
                    tecnicos: {
                        select: {
                            tecnicoId: true,
                            tecnico: {
                                select: {
                                    id_tecnico: true,
                                    nombre: true,
                                    email: true,
                                    rol: true,
                                    status: true,
                                },
                            },
                        },
                    },
                },
                orderBy: [
                    {
                        horaInicio: "asc",
                    },
                    {
                        id: "asc",
                    },
                ],
            }),
            prisma.visita.findMany({
                where: {
                    inicio: {
                        gte: inicioVisitasUtc,
                        lt: finVisitasUtc,
                    },
                    empresa: {
                        is: {
                            isActive: true,
                        },
                    },
                    ...(empresaIdForzada
                        ? {
                            empresaId: empresaIdForzada,
                        }
                        : {}),
                    ...(tecnicoIdQ
                        ? {
                            tecnicoId: tecnicoIdQ,
                        }
                        : {}),
                },
                select: {
                    id_visita: true,
                    empresaId: true,
                    tecnicoId: true,
                    solicitante: true,
                    solicitanteId: true,
                    inicio: true,
                    fin: true,
                    status: true,
                    direccion_visita: true,
                    sucursalId: true,
                    otrosDetalle: true,
                    empresa: {
                        select: {
                            id_empresa: true,
                            nombre: true,
                        },
                    },
                    tecnico: {
                        select: {
                            id_tecnico: true,
                            nombre: true,
                            email: true,
                            rol: true,
                            status: true,
                        },
                    },
                    solicitanteRef: {
                        select: {
                            id_solicitante: true,
                            nombre: true,
                            email: true,
                            telefono: true,
                        },
                    },
                    sucursal: {
                        select: {
                            id_sucursal: true,
                            nombre: true,
                            direccion: true,
                        },
                    },
                },
                orderBy: [
                    {
                        tecnicoId: "asc",
                    },
                    {
                        inicio: "asc",
                    },
                ],
            }),
        ]);
        const resumenPorTecnico = new Map();
        /*
          Primero se agregan los técnicos programados en el calendario.
        */
        for (const agenda of agendas) {
            for (const relacionTecnico of agenda.tecnicos) {
                const tecnico = relacionTecnico.tecnico;
                const tecnicoId = tecnico.id_tecnico;
                if (!resumenPorTecnico.has(tecnicoId)) {
                    resumenPorTecnico.set(tecnicoId, {
                        tecnico,
                        agendas: [],
                        atenciones: [],
                    });
                }
                const registro = resumenPorTecnico.get(tecnicoId);
                registro.agendas.push({
                    id: agenda.id,
                    fecha: agenda.fecha.toISOString().slice(0, 10),
                    tipo: agenda.tipo,
                    estado: agenda.estado,
                    empresaId: agenda.empresaId,
                    empresaNombre: agenda.empresa?.nombre?.trim() ||
                        agenda.empresaExternaNombre?.trim() ||
                        "OFICINA",
                    horaInicio: agenda.horaInicio,
                    horaFin: agenda.horaFin,
                    notas: agenda.notas,
                    mensaje: agenda.mensaje,
                });
            }
        }
        /*
          Después se agregan las atenciones registradas en Visita.
          Si un técnico trabajó sin agenda, también aparece para
          poder identificar actividad no programada.
        */
        for (const visita of atenciones) {
            const tecnicoId = visita.tecnicoId;
            if (!resumenPorTecnico.has(tecnicoId)) {
                resumenPorTecnico.set(tecnicoId, {
                    tecnico: visita.tecnico,
                    agendas: [],
                    atenciones: [],
                });
            }
            const registro = resumenPorTecnico.get(tecnicoId);
            registro.atenciones.push({
                id_visita: visita.id_visita,
                empresaId: visita.empresaId,
                empresaNombre: visita.empresa.nombre,
                solicitanteId: visita.solicitanteId,
                solicitanteNombre: visita.solicitanteRef?.nombre?.trim() ||
                    visita.solicitante?.trim() ||
                    "Solicitante no indicado",
                inicio: visita.inicio,
                fin: visita.fin,
                status: visita.status,
                direccion_visita: visita.direccion_visita,
                otrosDetalle: visita.otrosDetalle,
                sucursal: visita.sucursal,
            });
        }
        const tecnicos = Array.from(resumenPorTecnico.values())
            .map((registro) => {
            /*
              Como el modo lote crea una Visita por solicitante,
              varias atenciones pueden pertenecer a una misma jornada.
    
              La clave identifica una jornada real única.
            */
            const jornadasUnicas = new Set(registro.atenciones.map((atencion) => [
                atencion.empresaId,
                obtenerFechaChile(atencion.inicio),
            ].join("|")));
            const totalJornadas = jornadasUnicas.size;
            const empresasProgramadas = new Set(registro.agendas
                .map((agenda) => agenda.empresaId)
                .filter((id) => id !== null));
            const atencionesEnEmpresasProgramadas = registro.atenciones.filter((atencion) => empresasProgramadas.has(atencion.empresaId)).length;
            const atencionesFueraAgenda = registro.atenciones.length -
                atencionesEnEmpresasProgramadas;
            return {
                tecnico: registro.tecnico,
                tieneAgenda: registro.agendas.length > 0,
                resumen: {
                    totalProgramadas: registro.agendas.length,
                    totalAtenciones: registro.atenciones.length,
                    totalJornadas: jornadasUnicas.size,
                    completadas: registro.atenciones.filter((atencion) => atencion.status === "COMPLETADA").length,
                    pendientes: registro.atenciones.filter((atencion) => atencion.status === "PENDIENTE").length,
                    canceladas: registro.atenciones.filter((atencion) => atencion.status === "CANCELADA").length,
                    atencionesEnEmpresasProgramadas,
                    atencionesFueraAgenda,
                },
                agendas: registro.agendas,
                atenciones: registro.atenciones,
            };
        })
            .sort((a, b) => {
            /*
              Técnicos con agenda primero.
            */
            if (a.tieneAgenda !== b.tieneAgenda) {
                return a.tieneAgenda ? -1 : 1;
            }
            return a.tecnico.nombre.localeCompare(b.tecnico.nombre, "es");
        });
        return res.json({
            fechaDesde: fechaDesdeTexto,
            fechaHasta: fechaHastaTexto,
            totales: {
                tecnicos: tecnicos.length,
                tecnicosProgramados: tecnicos.filter((item) => item.tieneAgenda).length,
                agendas: agendas.length,
                atenciones: atenciones.length,
                completadas: atenciones.filter((visita) => visita.status === "COMPLETADA").length,
                pendientes: atenciones.filter((visita) => visita.status === "PENDIENTE").length,
                canceladas: atenciones.filter((visita) => visita.status === "CANCELADA").length,
            },
            tecnicos,
        });
    }
    catch (error) {
        console.error("[visitas.resumen-diario] error:", error);
        return res.status(500).json({
            error: "No se pudo obtener la agenda y las atenciones del día.",
        });
    }
};
//# sourceMappingURL=visitas.controller.js.map