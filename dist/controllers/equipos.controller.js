import { prisma } from "../lib/prisma.js";
import { z } from "zod";
/* ================== Schemas ================== */
const listQuerySchema = z.object({
    page: z.coerce.number().int().positive().default(1),
    pageSize: z.coerce.number().int().positive().max(200).default(20),
    // filtros
    search: z.string().trim().optional(), // serial/marca/modelo/procesador/solicitante/empresa
    marca: z.string().trim().optional(),
    empresaId: z.coerce.number().int().optional(),
    empresaName: z.string().trim().optional(),
    solicitanteId: z.coerce.number().int().optional(),
    sortBy: z.enum([
        "id_equipo", "serial", "marca", "modelo", "procesador", "ram", "disco", "propiedad"
    ]).default("id_equipo").optional(), // ⚠️ quitamos empresa/solicitante porque ya no hay relaciones
    sortDir: z.enum(["asc", "desc"]).default("desc").optional(),
});
// ⚠️ OJO: el schema de BD NO cambia. Solo el payload de creación.
const createEquipoSchema = z.object({
    empresaId: z.coerce.number().int().positive(),
    idSolicitante: z.coerce.number().int().positive().nullable().optional(),
    serial: z.string().trim().min(1),
    marca: z.string().trim().min(1),
    modelo: z.string().trim().min(1),
    procesador: z.string().trim().min(1),
    ram: z.string().trim().min(1),
    disco: z.string().trim().min(1),
    propiedad: z.string().trim().min(1),
});
// Para PATCH permitimos cambiar cualquier campo e idSolicitante puede venir null
const equipoUpdateSchema = z.object({
    idSolicitante: z.coerce.number().int().positive().nullable().optional(),
    serial: z.string().trim().min(1).optional(),
    marca: z.string().trim().min(1).optional(),
    modelo: z.string().trim().min(1).optional(),
    procesador: z.string().trim().min(1).optional(),
    ram: z.string().trim().min(1).optional(),
    disco: z.string().trim().min(1).optional(),
    propiedad: z.string().trim().min(1).optional(),
    empresaId: z.coerce.number().int().positive().optional(),
});
/* ================== CACHE SIMPLE ================== */
const equiposCache = new Map();
function clearCache() {
    equiposCache.clear();
}
/* ================== Helpers ================== */
function mapOrderBy(sortBy, sortDir) {
    const allowed = [
        "id_equipo", "serial", "marca", "modelo", "procesador", "ram", "disco", "propiedad"
    ];
    const key = (allowed.includes(sortBy)
        ? sortBy
        : "id_equipo");
    return { [key]: sortDir };
}
export async function listEquipos(req, res) {
    try {
        const q = listQuerySchema.parse(req.query);
        const INS = "insensitive";
        // Filtro en dos pasos si hay empresaId/empresaName o search por solicitante/empresa
        let solicitanteIdsForFilter;
        const wantsEmpresaFilter = !!q.empresaId || !!q.empresaName;
        const wantsSolicOrEmpSearch = q.search && q.search.trim().length > 0 ? true : false;
        if (wantsEmpresaFilter || wantsSolicOrEmpSearch) {
            const empIds = q.empresaId
                ? [q.empresaId]
                : q.empresaName
                    ? (await prisma.empresa.findMany({
                        where: { nombre: { contains: q.empresaName, mode: INS } },
                        select: { id_empresa: true },
                    })).map(e => e.id_empresa)
                    : undefined;
            const solicitanteWhere = {
                ...(empIds ? { empresaId: { in: empIds.length ? empIds : [-1] } } : {}),
                ...(wantsSolicOrEmpSearch && q.search
                    ? {
                        OR: [
                            { nombre: { contains: q.search, mode: INS } },
                            { email: { contains: q.search, mode: INS } },
                        ],
                    }
                    : {}),
            };
            if (Object.keys(solicitanteWhere).length > 0) {
                const sols = await prisma.solicitante.findMany({
                    where: solicitanteWhere,
                    select: { id_solicitante: true },
                });
                solicitanteIdsForFilter = sols.map(s => s.id_solicitante);
                // Para evitar traer todo si no hay match
                if (solicitanteIdsForFilter.length === 0 && (q.empresaId || q.empresaName || wantsSolicOrEmpSearch)) {
                    return res.json({ page: q.page, pageSize: q.pageSize, total: 0, totalPages: 1, items: [] });
                }
            }
        }
        const where = {
            ...(q.solicitanteId ? { idSolicitante: q.solicitanteId } : {}),
            ...(q.marca ? { marca: { equals: q.marca, mode: INS } } : {}),
            ...(q.search
                ? {
                    OR: [
                        { serial: { contains: q.search, mode: INS } },
                        { marca: { contains: q.search, mode: INS } },
                        { modelo: { contains: q.search, mode: INS } },
                        { procesador: { contains: q.search, mode: INS } },
                    ],
                }
                : {}),
            ...(solicitanteIdsForFilter
                ? { idSolicitante: { in: solicitanteIdsForFilter } }
                : {}),
        };
        const orderBy = mapOrderBy(q.sortBy, q.sortDir);
        const [total, rows] = await Promise.all([
            prisma.equipo.count({ where }),
            prisma.equipo.findMany({
                where,
                select: {
                    id_equipo: true,
                    serial: true,
                    marca: true,
                    modelo: true,
                    procesador: true,
                    ram: true,
                    disco: true,
                    propiedad: true,
                    idSolicitante: true,
                },
                orderBy,
                skip: (q.page - 1) * q.pageSize,
                take: q.pageSize,
            }),
        ]);
        // Enriquecer con nombres de solicitante y empresa SIN relaciones
        const idsSolic = Array.from(new Set(rows.map(r => r.idSolicitante).filter((v) => v != null)));
        let solById = new Map();
        let empById = new Map();
        if (idsSolic.length) {
            const sols = await prisma.solicitante.findMany({
                where: { id_solicitante: { in: idsSolic } },
                select: { id_solicitante: true, nombre: true, empresaId: true },
            });
            solById = new Map(sols.map(s => [s.id_solicitante, { nombre: s.nombre, empresaId: s.empresaId }]));
            const empIds = Array.from(new Set(sols.map(s => s.empresaId).filter((v) => v != null)));
            if (empIds.length) {
                const emps = await prisma.empresa.findMany({
                    where: { id_empresa: { in: empIds } },
                    select: { id_empresa: true, nombre: true },
                });
                empById = new Map(emps.map(e => [e.id_empresa, { nombre: e.nombre }]));
            }
        }
        const items = rows.map(e => {
            const s = e.idSolicitante ? solById.get(e.idSolicitante) ?? null : null;
            const emp = s?.empresaId ? empById.get(s.empresaId) ?? null : null;
            return {
                id_equipo: e.id_equipo,
                serial: e.serial,
                marca: e.marca,
                modelo: e.modelo,
                procesador: e.procesador,
                ram: e.ram,
                disco: e.disco,
                propiedad: e.propiedad,
                idSolicitante: e.idSolicitante,
                solicitante: s?.nombre ?? null,
                empresaId: s?.empresaId ?? null,
                empresa: emp?.nombre ?? null,
            };
        });
        return res.json({
            page: q.page,
            pageSize: q.pageSize,
            total,
            totalPages: Math.max(1, Math.ceil(total / q.pageSize)),
            items,
        });
    }
    catch (err) {
        console.error("listEquipos error:", err);
        if (err instanceof z.ZodError) {
            return res.status(400).json({ error: "Parámetros inválidos", details: err.flatten() });
        }
        return res.status(500).json({ error: "Error al listar equipos" });
    }
}
/* ================== placeholder solicitante ================== */
async function ensurePlaceholderSolicitante(empresaId) {
    const PLACEHOLDER_NAME = "[SIN SOLICITANTE]";
    const found = await prisma.solicitante.findFirst({
        where: { empresaId, nombre: PLACEHOLDER_NAME },
        select: { id_solicitante: true },
    });
    if (found)
        return found.id_solicitante;
    const created = await prisma.solicitante.create({
        data: { empresaId, nombre: PLACEHOLDER_NAME },
        select: { id_solicitante: true },
    });
    return created.id_solicitante;
}
/* ================== CREATE / READ / UPDATE / DELETE ================== */
export async function createEquipo(req, res) {
    try {
        const data = createEquipoSchema.parse(req.body);
        const { empresaId, idSolicitante: idSolFromBody, ...rest } = data;
        const empresa = await prisma.empresa.findUnique({
            where: { id_empresa: empresaId },
            select: { id_empresa: true },
        });
        if (!empresa)
            return res.status(400).json({ error: "Empresa no encontrada" });
        let idSolicitanteFinal;
        if (idSolFromBody == null) {
            idSolicitanteFinal = await ensurePlaceholderSolicitante(empresaId);
        }
        else {
            const sol = await prisma.solicitante.findUnique({
                where: { id_solicitante: idSolFromBody },
                select: { id_solicitante: true, empresaId: true },
            });
            if (!sol)
                return res.status(400).json({ error: "Solicitante no encontrado" });
            if (sol.empresaId !== empresaId) {
                return res.status(400).json({ error: "El solicitante no pertenece a la empresa seleccionada" });
            }
            idSolicitanteFinal = sol.id_solicitante;
        }
        const nuevo = await prisma.equipo.create({
            data: {
                ...rest,
                idSolicitante: idSolicitanteFinal, // ⚠️ sin relación
            },
        });
        clearCache();
        return res.status(201).json(nuevo);
    }
    catch (err) {
        console.error("Error al crear equipo:", err);
        if (err instanceof z.ZodError) {
            return res.status(400).json({ error: "Datos inválidos", detalles: err.flatten() });
        }
        return res.status(500).json({ error: "Error al crear equipo" });
    }
}
export async function getEquipoById(req, res) {
    try {
        const id = Number(req.params.id);
        if (isNaN(id))
            return res.status(400).json({ error: "ID inválido" });
        const equipo = await prisma.equipo.findUnique({
            where: { id_equipo: id },
            select: {
                id_equipo: true, serial: true, marca: true, modelo: true, procesador: true,
                ram: true, disco: true, propiedad: true, idSolicitante: true,
            },
        });
        if (!equipo)
            return res.status(404).json({ error: "Equipo no encontrado" });
        // enriquecer con nombres
        let solicitante = null;
        let empresa = null;
        let empresaId = null;
        if (equipo.idSolicitante != null) {
            const sol = await prisma.solicitante.findUnique({
                where: { id_solicitante: equipo.idSolicitante },
                select: { nombre: true, empresaId: true },
            });
            solicitante = sol?.nombre ?? null;
            empresaId = sol?.empresaId ?? null;
            if (empresaId != null) {
                const emp = await prisma.empresa.findUnique({
                    where: { id_empresa: empresaId },
                    select: { nombre: true },
                });
                empresa = emp?.nombre ?? null;
            }
        }
        return res.status(200).json({ ...equipo, solicitante, empresaId, empresa });
    }
    catch (err) {
        console.error("Error al obtener equipo:", err);
        return res.status(500).json({ error: "Error al obtener equipo" });
    }
}
export async function updateEquipo(req, res) {
    try {
        const id = Number(req.params.id);
        if (isNaN(id))
            return res.status(400).json({ error: "ID inválido" });
        const data = equipoUpdateSchema.parse(req.body);
        const equipoActual = await prisma.equipo.findUnique({
            where: { id_equipo: id },
            select: { id_equipo: true, idSolicitante: true },
        });
        if (!equipoActual)
            return res.status(404).json({ error: "Equipo no encontrado" });
        let idSolicitanteNuevo;
        if (data.idSolicitante !== undefined) {
            if (data.idSolicitante === null) {
                const empresaId = data.empresaId ??
                    (equipoActual.idSolicitante
                        ? (await prisma.solicitante.findUnique({
                            where: { id_solicitante: equipoActual.idSolicitante },
                            select: { empresaId: true },
                        }))?.empresaId ?? undefined
                        : undefined);
                if (!empresaId) {
                    return res.status(400).json({ error: "Para desasignar, especifica empresaId o el equipo debe tener solicitante actual" });
                }
                idSolicitanteNuevo = await ensurePlaceholderSolicitante(empresaId);
            }
            else {
                const sol = await prisma.solicitante.findUnique({
                    where: { id_solicitante: data.idSolicitante },
                    select: { id_solicitante: true, empresaId: true },
                });
                if (!sol)
                    return res.status(400).json({ error: "Solicitante no encontrado" });
                if (data.empresaId && sol.empresaId !== data.empresaId) {
                    return res.status(400).json({ error: "El solicitante no pertenece a la empresa indicada" });
                }
                idSolicitanteNuevo = sol.id_solicitante;
            }
        }
        const dataToUpdate = {
            ...(data.serial ? { serial: data.serial } : {}),
            ...(data.marca ? { marca: data.marca } : {}),
            ...(data.modelo ? { modelo: data.modelo } : {}),
            ...(data.procesador ? { procesador: data.procesador } : {}),
            ...(data.ram ? { ram: data.ram } : {}),
            ...(data.disco ? { disco: data.disco } : {}),
            ...(data.propiedad ? { propiedad: data.propiedad } : {}),
            ...(idSolicitanteNuevo !== undefined ? { idSolicitante: idSolicitanteNuevo } : {}),
        };
        const actualizado = await prisma.equipo.update({
            where: { id_equipo: id },
            data: dataToUpdate,
            select: {
                id_equipo: true, serial: true, marca: true, modelo: true, procesador: true,
                ram: true, disco: true, propiedad: true, idSolicitante: true,
            },
        });
        clearCache();
        return res.status(200).json(actualizado);
    }
    catch (err) {
        console.error("Error al actualizar equipo:", err);
        if (err?.code === "P2025") {
            return res.status(404).json({ error: "Equipo no encontrado" });
        }
        if (err instanceof z.ZodError) {
            return res.status(400).json({ error: "Datos inválidos", detalles: err.flatten() });
        }
        return res.status(500).json({ error: "Error al actualizar equipo" });
    }
}
export async function deleteEquipo(req, res) {
    try {
        const id = Number(req.params.id);
        if (isNaN(id))
            return res.status(400).json({ error: "ID inválido" });
        await prisma.equipo.delete({ where: { id_equipo: id } });
        clearCache();
        return res.status(204).send();
    }
    catch (err) {
        console.error("Error al eliminar equipo:", err);
        if (err?.code === "P2025") {
            return res.status(404).json({ error: "Equipo no encontrado" });
        }
        return res.status(500).json({ error: "Error al eliminar equipo" });
    }
}
//# sourceMappingURL=equipos.controller.js.map