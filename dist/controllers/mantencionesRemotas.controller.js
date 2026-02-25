import { prisma } from "../lib/prisma.js";
import { z } from "zod";
/* ------------------------------------ */
/* Helpers                               */
/* ------------------------------------ */
const parseId = (raw) => {
    const n = Number(raw);
    return Number.isInteger(n) && n > 0 ? n : null;
};
const parsePositiveInt = (raw) => {
    const n = Number(raw);
    return Number.isInteger(n) && n > 0 ? n : null;
};
function parseStatus(raw) {
    const s = String(raw ?? "").trim().toUpperCase();
    if (s === "PENDIENTE" || s === "COMPLETADA" || s === "CANCELADA")
        return s;
    return null;
}
function buildMonthFilter(monthN, yearN) {
    if (Number.isFinite(monthN) && Number.isFinite(yearN) && monthN >= 1 && monthN <= 12) {
        const from = new Date(yearN, monthN - 1, 1, 0, 0, 0, 0);
        const to = new Date(yearN, monthN, 1, 0, 0, 0, 0);
        return { gte: from, lt: to };
    }
    return undefined;
}
function getUser(req) {
    const u = req.user;
    return u ?? {};
}
function isCliente(user) {
    return String(user?.rol ?? "").toUpperCase() === "CLIENTE";
}
function isTecnico(user) {
    return String(user?.rol ?? "").toUpperCase() === "TECNICO";
}
async function assertClienteOwnershipOr404(id_mantencion, user) {
    const current = await prisma.mantencionRemota.findUnique({
        where: { id_mantencion },
        select: { empresaId: true },
    });
    if (!current)
        return null;
    if (isCliente(user)) {
        const userEmpresa = Number(user.empresaId);
        if (!Number.isFinite(userEmpresa) || userEmpresa <= 0) {
            const err = new Error("No autorizado");
            err.status = 403;
            throw err;
        }
        if (current.empresaId !== userEmpresa) {
            const err = new Error("No autorizado");
            err.status = 403;
            throw err;
        }
    }
    return current;
}
/** valida existencia FK para evitar Prisma issues */
async function assertTecnicoExists(tecnicoId) {
    const t = await prisma.tecnico.findUnique({
        where: { id_tecnico: tecnicoId },
        select: { id_tecnico: true },
    });
    return !!t;
}
async function assertEmpresaExists(empresaId) {
    const e = await prisma.empresa.findUnique({
        where: { id_empresa: empresaId },
        select: { id_empresa: true },
    });
    return !!e;
}
/**
 * Busca técnico por email (si existe).
 */
async function findTecnicoIdByEmail(email) {
    const e = String(email ?? "").trim().toLowerCase();
    if (!e)
        return null;
    const t = await prisma.tecnico.findUnique({
        where: { email: e },
        select: { id_tecnico: true },
    });
    return t?.id_tecnico ?? null;
}
/**
 * ✅ Fallback: algunos sistemas guardan sub como id_usuario (no id_tecnico).
 * Intentamos mapear a técnico por un campo tipo id_usuario.
 *
 * Si tu modelo Tecnico NO tiene ese campo, el query fallará -> retornamos null.
 */
async function findTecnicoIdByUserIdMaybe(userId) {
    if (!Number.isInteger(userId) || userId <= 0)
        return null;
    try {
        // OJO: esto requiere que exista un campo "id_usuario" en Tecnico.
        // Si no existe, Prisma lanzará error y lo atrapamos.
        const t = await prisma.tecnico.findFirst({
            where: { id_usuario: userId },
            select: { id_tecnico: true },
        });
        return t?.id_tecnico ?? null;
    }
    catch {
        return null;
    }
}
/**
 * ✅ Resolver tecnicoId sin depender del middleware:
 * 1) tecnicoId en body
 * 2) tecnicoEmail en body
 * 3) si rol TECNICO:
 *    3.1) probar req.user.id como id_tecnico (si existe)
 *    3.2) si no existe, probar map por id_usuario
 * 4) si req.user.email existe -> buscar por email
 */
async function resolveTecnicoId(user, payload) {
    // 1) tecnicoId explícito
    const tecnicoIdBody = Number(payload?.tecnicoId);
    if (Number.isInteger(tecnicoIdBody) && tecnicoIdBody > 0)
        return tecnicoIdBody;
    // 2) tecnicoEmail explícito
    const emailBody = String(payload?.tecnicoEmail ?? "").trim().toLowerCase();
    if (emailBody) {
        const byEmail = await findTecnicoIdByEmail(emailBody);
        if (byEmail)
            return byEmail;
    }
    // 3) si rol TECNICO => usar id del token, pero validar que exista como técnico
    if (isTecnico(user)) {
        const idToken = Number(user?.id);
        if (Number.isInteger(idToken) && idToken > 0) {
            // 3.1) si el sub ya es id_tecnico
            const exists = await assertTecnicoExists(idToken);
            if (exists)
                return idToken;
            // 3.2) si el sub es id_usuario
            const mapped = await findTecnicoIdByUserIdMaybe(idToken);
            if (mapped)
                return mapped;
        }
    }
    // 4) fallback por email en req.user
    const emailUser = String(user?.email ?? "").trim().toLowerCase();
    if (emailUser) {
        const byEmail = await findTecnicoIdByEmail(emailUser);
        if (byEmail)
            return byEmail;
    }
    return null;
}
/* ------------------------------------ */
/* Select                                */
/* ------------------------------------ */
const mantencionSelect = {
    id_mantencion: true,
    empresaId: true,
    tecnicoId: true,
    solicitante: true,
    inicio: true,
    fin: true,
    soporteRemoto: true,
    actualizaciones: true,
    antivirus: true,
    ccleaner: true,
    estadoDisco: true,
    licenciaOffice: true,
    licenciaWindows: true,
    optimizacion: true,
    respaldo: true,
    otros: true,
    otrosDetalle: true,
    status: true,
    solicitanteId: true,
    empresa: { select: { id_empresa: true, nombre: true } },
    tecnico: { select: { id_tecnico: true, nombre: true } },
    solicitanteRef: { select: { id_solicitante: true, nombre: true } },
};
const StatusEnum = z.enum(["PENDIENTE", "COMPLETADA", "CANCELADA"]);
const baseFlags = z.object({
    soporteRemoto: z.boolean().optional(),
    actualizaciones: z.boolean().optional(),
    antivirus: z.boolean().optional(),
    ccleaner: z.boolean().optional(),
    estadoDisco: z.boolean().optional(),
    licenciaOffice: z.boolean().optional(),
    licenciaWindows: z.boolean().optional(),
    optimizacion: z.boolean().optional(),
    respaldo: z.boolean().optional(),
    otros: z.boolean().optional(),
    otrosDetalle: z.string().trim().optional().nullable(),
});
/**
 * create: acepta:
 * - uno: solicitanteId / solicitante
 * - lote: solicitantesIds / solicitantesNombres
 * - empresaId opcional: si CLIENTE se toma del token
 * - tecnicoId opcional: se resuelve por tecnicoEmail o token
 */
const CreateMantencionSchema = z
    .object({
    empresaId: z.number().int().positive().optional(),
    tecnicoId: z.number().int().positive().optional(),
    tecnicoEmail: z.string().trim().email().optional(),
    solicitanteId: z.number().int().positive().optional(),
    solicitante: z.string().trim().optional(),
    solicitantesIds: z.array(z.number().int().positive()).optional(),
    // typo-safe alias
    solicititantesNombres: z.array(z.string().trim().min(1)).optional(),
    solicitantesNombres: z.array(z.string().trim().min(1)).optional(),
    inicio: z.coerce.date(),
    fin: z.coerce.date().optional().nullable(),
    status: StatusEnum.optional().default("PENDIENTE"),
})
    .extend(baseFlags.shape)
    .superRefine((d, ctx) => {
    const nombres = d.solicitantesNombres ?? d.solicititantesNombres;
    const hasBatch = (d.solicitantesIds && d.solicitantesIds.length > 0) || (nombres && nombres.length > 0);
    const hasSingle = !!d.solicitanteId || (d.solicitante && d.solicitante.trim().length > 0);
    if (!hasBatch && !hasSingle) {
        ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: "Debes enviar: (solicitanteId o solicitante) o (solicitantesIds/solicitantesNombres).",
            path: ["solicitante"],
        });
    }
});
const UpdateMantencionSchema = z
    .object({
    empresaId: z.number().int().positive().optional(),
    tecnicoId: z.number().int().positive().optional(),
    solicitanteId: z.number().int().positive().optional(),
    solicitante: z.string().trim().optional(),
    inicio: z.coerce.date().optional(),
    fin: z.coerce.date().optional().nullable(),
    status: StatusEnum.optional(),
})
    .extend(baseFlags.partial().shape);
/* ------------------------------------ */
/* WHERE                                 */
/* ------------------------------------ */
function buildWhereFromQuery(req) {
    const user = getUser(req);
    const tecnicoIdN = parsePositiveInt(req.query.tecnicoId);
    const empresaIdQ = req.query.empresaId;
    const q = String(req.query.q ?? "").trim();
    const status = parseStatus(req.query.status);
    const monthN = Number(req.query.month);
    const yearN = Number(req.query.year);
    const dateFilter = buildMonthFilter(monthN, yearN);
    const INS = "insensitive";
    const empresaIdFilter = isCliente(user)
        ? parsePositiveInt(user.empresaId)
        : empresaIdQ
            ? parsePositiveInt(empresaIdQ)
            : null;
    const where = {
        ...(empresaIdFilter ? { empresaId: empresaIdFilter } : {}),
        ...(tecnicoIdN ? { tecnicoId: tecnicoIdN } : {}),
        ...(status ? { status } : {}),
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
    return where;
}
/* ------------------------------------ */
/* List                                  */
/* ------------------------------------ */
export const listMantencionesRemotas = async (req, res) => {
    try {
        const page = Math.max(1, Number(req.query.page ?? 1));
        const pageSize = Math.min(100, Math.max(1, Number(req.query.pageSize ?? 10)));
        const where = buildWhereFromQuery(req);
        const [total, rows] = await Promise.all([
            prisma.mantencionRemota.count({ where }),
            prisma.mantencionRemota.findMany({
                where,
                skip: (page - 1) * pageSize,
                take: pageSize,
                orderBy: [{ inicio: "desc" }],
                select: mantencionSelect,
            }),
        ]);
        return res.json({
            page,
            pageSize,
            total,
            totalPages: Math.max(1, Math.ceil(total / pageSize)),
            items: Array.isArray(rows) ? rows : [],
        });
    }
    catch (err) {
        console.error("[mantencionesRemotas.list] error:", err);
        return res.status(500).json({ error: "No se pudo listar mantenciones" });
    }
};
/* ------------------------------------ */
/* Export (JSON)                         */
/* ------------------------------------ */
export const exportMantencionesRemotas = async (req, res) => {
    try {
        const where = buildWhereFromQuery(req);
        const rows = await prisma.mantencionRemota.findMany({
            where,
            orderBy: [{ inicio: "desc" }],
            select: mantencionSelect,
        });
        return res.json({
            total: rows.length,
            items: Array.isArray(rows) ? rows : [],
        });
    }
    catch (err) {
        console.error("[mantencionesRemotas.export] error:", err);
        return res.status(500).json({ error: "No se pudo exportar mantenciones" });
    }
};
/* ------------------------------------ */
/* Get by ID                             */
/* ------------------------------------ */
export const getMantencionRemotaById = async (req, res) => {
    const id = parseId(req.params.id);
    if (!id)
        return res.status(400).json({ error: "id inválido" });
    try {
        const row = await prisma.mantencionRemota.findUnique({
            where: { id_mantencion: id },
            select: mantencionSelect,
        });
        if (!row)
            return res.status(404).json({ error: "Mantención no encontrada" });
        const user = getUser(req);
        if (isCliente(user) && row.empresaId !== Number(user.empresaId)) {
            return res.status(403).json({ error: "No autorizado" });
        }
        return res.json(row);
    }
    catch (err) {
        console.error("[mantencionesRemotas.getById] error:", err);
        return res.status(500).json({ error: "No se pudo obtener la mantención" });
    }
};
/* ------------------------------------ */
/* Create (single o lote)                */
/* ------------------------------------ */
export const createMantencionRemota = async (req, res) => {
    try {
        const payloadRaw = CreateMantencionSchema.parse(req.body);
        const payload = {
            ...payloadRaw,
            solicitantesNombres: payloadRaw.solicitantesNombres ?? payloadRaw.solicititantesNombres,
        };
        const user = getUser(req);
        // empresaId final
        const empresaIdFinal = isCliente(user) ? Number(user.empresaId) : Number(payload.empresaId);
        if (!Number.isFinite(empresaIdFinal) || empresaIdFinal <= 0) {
            return res.status(400).json({ error: "empresaId inválido o faltante" });
        }
        // tecnicoId final (robusto)
        const tecnicoIdFinal = await resolveTecnicoId(user, payload);
        if (!tecnicoIdFinal || !Number.isFinite(tecnicoIdFinal) || tecnicoIdFinal <= 0) {
            return res.status(400).json({
                error: "No se pudo detectar el técnico. Envía 'tecnicoId' o 'tecnicoEmail' en el body, o asegúrate que tu token corresponda a un técnico.",
            });
        }
        const [empresaOk, tecnicoOk] = await Promise.all([
            assertEmpresaExists(empresaIdFinal),
            assertTecnicoExists(tecnicoIdFinal),
        ]);
        if (!empresaOk)
            return res.status(400).json({ error: "empresaId no existe" });
        if (!tecnicoOk)
            return res.status(400).json({ error: "tecnicoId no existe" });
        const isBatch = (payload.solicitantesIds && payload.solicitantesIds.length > 0) ||
            (payload.solicitantesNombres && payload.solicitantesNombres.length > 0);
        const otrosDetalleFinal = payload.otros === undefined
            ? payload.otrosDetalle ?? null
            : payload.otros
                ? payload.otrosDetalle ?? null
                : null;
        const commonData = {
            empresaId: empresaIdFinal,
            tecnicoId: tecnicoIdFinal,
            inicio: payload.inicio,
            fin: payload.fin ?? null,
            status: payload.status ?? "PENDIENTE",
            soporteRemoto: !!payload.soporteRemoto,
            actualizaciones: !!payload.actualizaciones,
            antivirus: !!payload.antivirus,
            ccleaner: !!payload.ccleaner,
            estadoDisco: !!payload.estadoDisco,
            licenciaOffice: !!payload.licenciaOffice,
            licenciaWindows: !!payload.licenciaWindows,
            optimizacion: !!payload.optimizacion,
            respaldo: !!payload.respaldo,
            otros: !!payload.otros,
            otrosDetalle: otrosDetalleFinal,
        };
        // SINGLE
        if (!isBatch) {
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
            const created = await prisma.mantencionRemota.create({
                data: { ...commonData, solicitanteId, solicitante },
                select: mantencionSelect,
            });
            return res.status(201).json(created);
        }
        // LOTE
        let resolvedFromIds = [];
        if (payload.solicitantesIds?.length) {
            const rows = await prisma.solicitante.findMany({
                where: { id_solicitante: { in: payload.solicitantesIds } },
                select: { id_solicitante: true, nombre: true },
            });
            const foundIds = new Set(rows.map((r) => r.id_solicitante));
            const missing = payload.solicitantesIds.filter((id) => !foundIds.has(id));
            if (missing.length) {
                return res.status(400).json({ error: "Algunos solicitantesId no existen", missing });
            }
            resolvedFromIds = rows.map((r) => ({
                solicitanteId: r.id_solicitante,
                solicitante: r.nombre,
            }));
        }
        const fromNames = (payload.solicitantesNombres ?? [])
            .map((n) => n.trim())
            .filter((n) => n.length > 0)
            .map((n) => ({ solicitanteId: null, solicitante: n }));
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
            return res.status(400).json({ error: "No hay solicitantes válidos para crear mantenciones" });
        }
        const createdList = await prisma.$transaction(allTargets.map((t) => prisma.mantencionRemota.create({
            data: {
                ...commonData,
                solicitanteId: t.solicitanteId,
                solicitante: t.solicitante,
            },
            select: mantencionSelect,
        })));
        return res.status(201).json({
            createdCount: createdList.length,
            mantenciones: createdList,
        });
    }
    catch (err) {
        if (err instanceof z.ZodError) {
            console.log("[mantencionesRemotas.create] zod:", err.flatten());
            return res.status(400).json({ error: "Datos inválidos", details: err.flatten() });
        }
        console.error("[mantencionesRemotas.create] error:", err);
        return res.status(500).json({ error: "No se pudo crear la(s) mantención(es)" });
    }
};
/* ------------------------------------ */
/* Update                                */
/* ------------------------------------ */
export const updateMantencionRemota = async (req, res) => {
    const id = parseId(req.params.id);
    if (!id)
        return res.status(400).json({ error: "id inválido" });
    try {
        const payload = UpdateMantencionSchema.parse(req.body);
        const user = getUser(req);
        // Cliente: validar ownership + bloquear cambio empresa
        if (isCliente(user)) {
            const current = await prisma.mantencionRemota.findUnique({
                where: { id_mantencion: id },
                select: { empresaId: true },
            });
            if (!current)
                return res.status(404).json({ error: "Mantención no encontrada" });
            if (current.empresaId !== Number(user.empresaId)) {
                return res.status(403).json({ error: "No autorizado" });
            }
            payload.empresaId = undefined;
        }
        if (payload.empresaId !== undefined) {
            const ok = await assertEmpresaExists(payload.empresaId);
            if (!ok)
                return res.status(400).json({ error: "empresaId no existe" });
        }
        if (payload.tecnicoId !== undefined) {
            const tecnicoOk = await assertTecnicoExists(payload.tecnicoId);
            if (!tecnicoOk)
                return res.status(400).json({ error: "tecnicoId no existe" });
        }
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
        const updated = await prisma.mantencionRemota.update({
            where: { id_mantencion: id },
            data: {
                ...(payload.empresaId !== undefined ? { empresaId: payload.empresaId } : {}),
                ...(payload.tecnicoId !== undefined ? { tecnicoId: payload.tecnicoId } : {}),
                ...(payload.solicitanteId !== undefined ? { solicitanteId: payload.solicitanteId } : {}),
                ...(solicitanteToSet !== undefined ? { solicitante: solicitanteToSet } : {}),
                ...(payload.inicio !== undefined ? { inicio: payload.inicio } : {}),
                ...(payload.fin !== undefined ? { fin: payload.fin } : {}),
                ...(payload.status !== undefined ? { status: payload.status } : {}),
                ...(payload.soporteRemoto !== undefined ? { soporteRemoto: !!payload.soporteRemoto } : {}),
                ...(payload.actualizaciones !== undefined ? { actualizaciones: !!payload.actualizaciones } : {}),
                ...(payload.antivirus !== undefined ? { antivirus: !!payload.antivirus } : {}),
                ...(payload.ccleaner !== undefined ? { ccleaner: !!payload.ccleaner } : {}),
                ...(payload.estadoDisco !== undefined ? { estadoDisco: !!payload.estadoDisco } : {}),
                ...(payload.licenciaOffice !== undefined ? { licenciaOffice: !!payload.licenciaOffice } : {}),
                ...(payload.licenciaWindows !== undefined ? { licenciaWindows: !!payload.licenciaWindows } : {}),
                ...(payload.optimizacion !== undefined ? { optimizacion: !!payload.optimizacion } : {}),
                ...(payload.respaldo !== undefined ? { respaldo: !!payload.respaldo } : {}),
                ...(payload.otros !== undefined ? { otros: !!payload.otros } : {}),
                ...(otrosDetalle !== undefined ? { otrosDetalle } : {}),
            },
            select: mantencionSelect,
        });
        return res.json(updated);
    }
    catch (err) {
        if (err instanceof z.ZodError) {
            return res.status(400).json({ error: "Datos inválidos", details: err.flatten() });
        }
        if (err?.code === "P2025") {
            return res.status(404).json({ error: "Mantención no encontrada" });
        }
        console.error("[mantencionesRemotas.update] error:", err);
        return res.status(500).json({ error: "No se pudo actualizar la mantención" });
    }
};
/* ------------------------------------ */
/* Delete                                */
/* ------------------------------------ */
export const deleteMantencionRemota = async (req, res) => {
    const id = parseId(req.params.id);
    if (!id)
        return res.status(400).json({ error: "id inválido" });
    try {
        const user = getUser(req);
        const current = await assertClienteOwnershipOr404(id, user);
        if (!current)
            return res.status(404).json({ error: "Mantención no encontrada" });
        await prisma.mantencionRemota.delete({ where: { id_mantencion: id } });
        return res.status(204).send();
    }
    catch (err) {
        if (err?.status === 403)
            return res.status(403).json({ error: "No autorizado" });
        if (err?.code === "P2025")
            return res.status(404).json({ error: "Mantención no encontrada" });
        console.error("[mantencionesRemotas.delete] error:", err);
        return res.status(500).json({ error: "No se pudo eliminar la mantención" });
    }
};
/* ------------------------------------ */
/* Close (COMPLETADA)                    */
/* ------------------------------------ */
export const closeMantencionRemota = async (req, res) => {
    const id = parseId(req.params.id);
    if (!id)
        return res.status(400).json({ error: "id inválido" });
    try {
        const user = getUser(req);
        const current = await assertClienteOwnershipOr404(id, user);
        if (!current)
            return res.status(404).json({ error: "Mantención no encontrada" });
        const updated = await prisma.mantencionRemota.update({
            where: { id_mantencion: id },
            data: { status: "COMPLETADA", fin: new Date() },
            select: mantencionSelect,
        });
        return res.json(updated);
    }
    catch (err) {
        if (err?.status === 403)
            return res.status(403).json({ error: "No autorizado" });
        if (err?.code === "P2025")
            return res.status(404).json({ error: "Mantención no encontrada" });
        console.error("[mantencionesRemotas.close] error:", err);
        return res.status(500).json({ error: "No se pudo cerrar la mantención" });
    }
};
/* ------------------------------------ */
/* Metrics                               */
/* ------------------------------------ */
export const mantencionesRemotasMetrics = async (req, res) => {
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
        const user = getUser(req);
        const empresaIdFilter = isCliente(user) ? parsePositiveInt(user.empresaId) : null;
        const baseWhere = {
            ...(empresaIdFilter ? { empresaId: empresaIdFilter } : {}),
            inicio: { gte: from, lt: to },
        };
        const total = await prisma.mantencionRemota.count({ where: baseWhere });
        const groupedTecnico = await prisma.mantencionRemota.groupBy({
            by: ["tecnicoId"],
            where: baseWhere,
            _count: { _all: true },
        });
        const groupedStatus = await prisma.mantencionRemota.groupBy({
            by: ["status"],
            where: baseWhere,
            _count: { _all: true },
        });
        // 🔹 Filtrar null correctamente (type guard)
        const tecnicoIds = groupedTecnico
            .map((g) => g.tecnicoId)
            .filter((id) => id !== null);
        const tecnicos = tecnicoIds.length
            ? await prisma.tecnico.findMany({
                where: { id_tecnico: { in: tecnicoIds } },
                select: { id_tecnico: true, nombre: true },
            })
            : [];
        const nameById = new Map(tecnicos.map((t) => [t.id_tecnico, t.nombre]));
        const porTecnico = groupedTecnico
            .map((g) => {
            if (g.tecnicoId === null) {
                return {
                    tecnicoId: null,
                    tecnico: "Sin asignar",
                    cantidad: g._count._all,
                };
            }
            return {
                tecnicoId: g.tecnicoId,
                tecnico: nameById.get(g.tecnicoId) ?? `Técnico ${g.tecnicoId}`,
                cantidad: g._count._all,
            };
        })
            .sort((a, b) => b.cantidad - a.cantidad);
        const porStatus = groupedStatus
            .map((g) => ({
            status: g.status,
            cantidad: g._count._all,
        }))
            .sort((a, b) => b.cantidad - a.cantidad);
        return res.json({ total, porTecnico, porStatus });
    }
    catch (err) {
        console.error("[mantencionesRemotas.metrics] error:", err);
        return res.status(500).json({ error: "No se pudieron obtener métricas" });
    }
};
/* ------------------------------------ */
/* Filters                               */
/* ------------------------------------ */
export const getMantencionesRemotasFilters = async (req, res) => {
    try {
        const user = getUser(req);
        const tecnicosPromise = prisma.tecnico.findMany({
            orderBy: { nombre: "asc" },
            select: { id_tecnico: true, nombre: true },
        });
        const empresasPromise = isCliente(user)
            ? prisma.empresa.findMany({
                where: { id_empresa: Number(user.empresaId) },
                orderBy: { nombre: "asc" },
                select: { id_empresa: true, nombre: true },
            })
            : prisma.empresa.findMany({
                orderBy: { nombre: "asc" },
                select: { id_empresa: true, nombre: true },
            });
        const [tecnicos, empresas] = await Promise.all([tecnicosPromise, empresasPromise]);
        return res.json({
            tecnicos: tecnicos.map((t) => ({ id: t.id_tecnico, nombre: t.nombre })),
            empresas: empresas.map((e) => ({ id: e.id_empresa, nombre: e.nombre })),
        });
    }
    catch (err) {
        console.error("[mantencionesRemotas.filters] error:", err);
        return res.status(500).json({ error: "No se pudieron cargar filtros" });
    }
};
//# sourceMappingURL=mantencionesRemotas.controller.js.map