import { TipoEquipo } from "@prisma/client";
import { prisma } from "../lib/prisma.js";
import { z } from "zod";
/* ================== Schemas ================== */
const listQuerySchema = z.object({
    page: z.coerce.number().int().positive().default(1),
    pageSize: z.coerce.number().int().positive().max(500).default(20),
    search: z.string().trim().optional(),
    marca: z.string().trim().optional(),
    tipo: z.nativeEnum(TipoEquipo).optional(),
    empresaId: z.coerce.number().int().optional(),
    empresaName: z.string().trim().optional(),
    solicitanteId: z.coerce.number().int().optional(),
    sortBy: z.enum([
        "id_equipo",
        "serial",
        "tipo",
        "marca",
        "modelo",
        "procesador",
        "ram",
        "disco",
        "propiedad",
    ]).default("id_equipo").optional(),
    sortDir: z.enum(["asc", "desc"]).default("desc").optional(),
});
const createEquipoSchema = z.object({
    empresaId: z.coerce.number().int().positive().optional(),
    idSolicitante: z.coerce.number().int().positive().nullable().optional(),
    tipo: z.nativeEnum(TipoEquipo).default(TipoEquipo.GENERICO),
    serial: z.string().trim().min(1),
    marca: z.string().trim().min(1),
    modelo: z.string().trim().min(1),
    procesador: z.string().trim().min(1),
    ram: z.string().trim().min(1),
    disco: z.string().trim().min(1),
    propiedad: z.string().trim().min(1),
});
const equipoUpdateSchema = z.object({
    idSolicitante: z.coerce.number().int().positive().nullable().optional(),
    tipo: z.nativeEnum(TipoEquipo).optional(),
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
        "id_equipo",
        "serial",
        "tipo",
        "marca",
        "modelo",
        "procesador",
        "ram",
        "disco",
        "propiedad",
    ];
    const key = allowed.includes(sortBy)
        ? sortBy
        : "id_equipo";
    return { [key]: sortDir };
}
function flattenRow(e) {
    return {
        id_equipo: e.id_equipo,
        serial: e.serial,
        tipo: e.tipo,
        marca: e.marca,
        modelo: e.modelo,
        procesador: e.procesador,
        ram: e.ram,
        disco: e.disco,
        propiedad: e.propiedad,
        solicitante: e.solicitante ? e.solicitante.nombre : "[Sin solicitante]",
        empresa: e.solicitante?.empresa?.nombre ?? null,
        empresaId: e.solicitante?.empresa?.id_empresa ?? null,
        idSolicitante: e.idSolicitante,
    };
}
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
/* ================== LIST ================== */
export async function listEquipos(req, res) {
    try {
        const q = listQuerySchema.parse(req.query);
        const INS = "insensitive";
        const where = {
            ...(q.tipo ? { tipo: q.tipo } : {}),
            ...(q.empresaId
                ? {
                    solicitante: {
                        is: { empresaId: q.empresaId },
                    },
                }
                : {}),
            ...(q.empresaName
                ? {
                    solicitante: {
                        is: { empresa: { is: { nombre: { contains: q.empresaName, mode: INS } } } },
                    },
                }
                : {}),
            ...(q.solicitanteId ? { idSolicitante: q.solicitanteId } : {}),
            ...(q.marca ? { marca: { equals: q.marca, mode: INS } } : {}),
            ...(q.search
                ? {
                    OR: [
                        { serial: { contains: q.search, mode: INS } },
                        { marca: { contains: q.search, mode: INS } },
                        { modelo: { contains: q.search, mode: INS } },
                        { procesador: { contains: q.search, mode: INS } },
                        { solicitante: { is: { nombre: { contains: q.search, mode: INS } } } },
                        {
                            solicitante: {
                                is: {
                                    empresa: { is: { nombre: { contains: q.search, mode: INS } } },
                                },
                            },
                        },
                    ],
                }
                : {}),
        };
        const orderBy = mapOrderBy(q.sortBy, q.sortDir);
        const [total, rows] = await Promise.all([
            prisma.equipo.count({ where }),
            prisma.equipo.findMany({
                where,
                include: { solicitante: { include: { empresa: true } } },
                orderBy,
                skip: (q.page - 1) * q.pageSize,
                take: q.pageSize,
            }),
        ]);
        return res.json({
            page: q.page,
            pageSize: q.pageSize,
            total,
            totalPages: Math.max(1, Math.ceil(total / q.pageSize)),
            items: rows.map(flattenRow),
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
/* ================== CREATE ================== */
export async function createEquipo(req, res) {
    try {
        const data = createEquipoSchema.parse(req.body);
        if (data.serial) {
            const existe = await prisma.equipo.findUnique({ where: { serial: data.serial } });
            if (existe) {
                return res.status(400).json({ error: "Ya existe un equipo con ese serial" });
            }
        }
        let idSolicitanteFinal = null;
        if (data.idSolicitante) {
            const sol = await prisma.solicitante.findUnique({
                where: { id_solicitante: data.idSolicitante },
            });
            if (!sol)
                return res.status(400).json({ error: "Solicitante no encontrado" });
            idSolicitanteFinal = sol.id_solicitante;
        }
        else if (data.empresaId) {
            const empresa = await prisma.empresa.findUnique({
                where: { id_empresa: data.empresaId },
            });
            if (!empresa)
                return res.status(400).json({ error: "Empresa no encontrada" });
            idSolicitanteFinal = await ensurePlaceholderSolicitante(empresa.id_empresa);
        }
        const equipo = await prisma.equipo.create({
            data: {
                tipo: data.tipo,
                marca: data.marca,
                modelo: data.modelo,
                serial: data.serial,
                procesador: data.procesador,
                ram: data.ram,
                disco: data.disco,
                propiedad: data.propiedad,
                idSolicitante: idSolicitanteFinal,
            },
        });
        clearCache();
        return res.status(201).json(equipo);
    }
    catch (err) {
        console.error("createEquipo error:", err);
        if (err instanceof z.ZodError) {
            return res.status(400).json({ error: "Datos inválidos", details: err.flatten() });
        }
        return res.status(500).json({ error: "Error al crear equipo" });
    }
}
/* ================== READ ONE ================== */
export async function getEquipoById(req, res) {
    try {
        const id = Number(req.params.id);
        if (isNaN(id))
            return res.status(400).json({ error: "ID inválido" });
        const equipo = await prisma.equipo.findUnique({
            where: { id_equipo: id },
            include: { solicitante: { include: { empresa: true } } },
        });
        if (!equipo)
            return res.status(404).json({ error: "Equipo no encontrado" });
        return res.status(200).json(equipo);
    }
    catch (err) {
        console.error("getEquipoById error:", err);
        return res.status(500).json({ error: "Error al obtener equipo" });
    }
}
/* ================== UPDATE ================== */
export async function updateEquipo(req, res) {
    try {
        const id = Number(req.params.id);
        if (isNaN(id))
            return res.status(400).json({ error: "ID inválido" });
        const data = equipoUpdateSchema.parse(req.body);
        const equipoActual = await prisma.equipo.findUnique({
            where: { id_equipo: id },
            include: { solicitante: { select: { empresaId: true } } },
        });
        if (!equipoActual) {
            return res.status(404).json({ error: "Equipo no encontrado" });
        }
        let solicitanteUpdate;
        if (data.idSolicitante !== undefined) {
            if (data.idSolicitante === null) {
                const empresaId = data.empresaId ?? equipoActual.solicitante?.empresaId;
                if (!empresaId) {
                    return res.status(400).json({
                        error: "Para desasignar solicitante debes indicar empresaId",
                    });
                }
                const placeholderId = await ensurePlaceholderSolicitante(empresaId);
                solicitanteUpdate = { connect: { id_solicitante: placeholderId } };
            }
            else {
                solicitanteUpdate = { connect: { id_solicitante: data.idSolicitante } };
            }
        }
        const actualizado = await prisma.equipo.update({
            where: { id_equipo: id },
            data: {
                ...(data.tipo ? { tipo: data.tipo } : {}),
                ...(data.serial ? { serial: data.serial } : {}),
                ...(data.marca ? { marca: data.marca } : {}),
                ...(data.modelo ? { modelo: data.modelo } : {}),
                ...(data.procesador ? { procesador: data.procesador } : {}),
                ...(data.ram ? { ram: data.ram } : {}),
                ...(data.disco ? { disco: data.disco } : {}),
                ...(data.propiedad ? { propiedad: data.propiedad } : {}),
                ...(solicitanteUpdate ? { solicitante: solicitanteUpdate } : {}),
            },
            include: { solicitante: { include: { empresa: true } } },
        });
        clearCache();
        return res.status(200).json(actualizado);
    }
    catch (err) {
        console.error("updateEquipo error:", err);
        if (err?.code === "P2025") {
            return res.status(404).json({ error: "Equipo no encontrado" });
        }
        if (err instanceof z.ZodError) {
            return res.status(400).json({ error: "Datos inválidos", details: err.flatten() });
        }
        return res.status(500).json({ error: "Error al actualizar equipo" });
    }
}
/* ================== DELETE ================== */
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
        console.error("deleteEquipo error:", err);
        if (err?.code === "P2025") {
            return res.status(404).json({ error: "Equipo no encontrado" });
        }
        return res.status(500).json({ error: "Error al eliminar equipo" });
    }
}
// ================== EQUIPOS POR EMPRESA (MODAL) ==================
// GET /api/empresas/:empresaId/equipos
export async function getEquiposByEmpresa(req, res) {
    try {
        const empresaId = Number(req.params.empresaId);
        if (!Number.isInteger(empresaId) || empresaId <= 0) {
            return res.status(400).json({ error: "empresaId inválido" });
        }
        const equipos = await prisma.equipo.findMany({
            where: {
                solicitante: {
                    empresaId,
                },
            },
            include: {
                solicitante: {
                    select: {
                        id_solicitante: true,
                        nombre: true,
                    },
                },
            },
            orderBy: { id_equipo: "asc" },
        });
        return res.json({
            total: equipos.length,
            items: equipos,
        });
    }
    catch (err) {
        console.error("getEquiposByEmpresa error:", err);
        return res.status(500).json({
            error: "Error al obtener equipos por empresa",
        });
    }
}
//# sourceMappingURL=equipos.controller.js.map