import { prisma } from "../lib/prisma.js";
import { z } from "zod";
// Importa solo lo que Prisma sí está exportando correctamente
import { Prisma, TipoEquipo } from "@prisma/client";
// Define AuditAction manualmente aquí para que no rompa el código de abajo
var AuditAction;
(function (AuditAction) {
    AuditAction["CREATE"] = "CREATE";
    AuditAction["UPDATE"] = "UPDATE";
    AuditAction["DELETE"] = "DELETE";
})(AuditAction || (AuditAction = {}));
/* ================== Schemas ================== */
const listQuerySchema = z.object({
    page: z.coerce.number().int().positive().default(1),
    pageSize: z.coerce.number().int().positive().max(1000).default(20),
    search: z.string().trim().optional(),
    marca: z.string().trim().optional(),
    tipo: z.nativeEnum(TipoEquipo).optional(),
    empresaId: z.coerce.number().int().optional(),
    empresaName: z.string().trim().optional(),
    solicitanteId: z.coerce.number().int().optional(),
    mode: z.enum(["full", "selector"]).default("full").optional(),
    sortBy: z
        .enum([
        "id_equipo",
        "serial",
        "tipo",
        "marca",
        "modelo",
        "procesador",
        "ram",
        "disco",
        "propiedad",
    ])
        .default("id_equipo")
        .optional(),
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
    // 🔥 NUEVOS CAMPOS DETALLE
    macWifi: z.string().optional(),
    redEthernet: z.string().optional(),
    so: z.string().optional(),
    tipoDd: z.string().optional(),
    estadoAlm: z.string().optional(),
    office: z.string().optional(),
    teamViewer: z.string().optional(),
    claveTv: z.string().optional(),
    revisado: z.string().optional(),
    adminRidsUsuario: z.string().optional(),
    adminRidsPassword: z.string().optional(),
    usuarioEmpresa: z.string().optional(),
    passwordEmpresa: z.string().optional(),
    usuarioPersonal: z.string().optional(),
    passwordPersonal: z.string().optional(),
});
// 🔥 Nuevo: acepta 1 equipo o { equipos: [...] }
const createEquiposRequestSchema = z.union([
    createEquipoSchema, // 1 solo equipo
    z.array(createEquipoSchema).min(1), // array directo
    z.object({
        equipos: z.array(createEquipoSchema).min(1), // { equipos: [...] }
    }),
]);
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
    // 🔥 NUEVOS
    macWifi: z.string().optional(),
    redEthernet: z.string().optional(),
    so: z.string().optional(),
    tipoDd: z.string().optional(),
    estadoAlm: z.string().optional(),
    office: z.string().optional(),
    teamViewer: z.string().optional(),
    claveTv: z.string().optional(),
    revisado: z.string().optional(),
    adminRidsUsuario: z.string().optional(),
    adminRidsPassword: z.string().optional(),
    usuarioEmpresa: z.string().optional(),
    passwordEmpresa: z.string().optional(),
    usuarioPersonal: z.string().optional(),
    passwordPersonal: z.string().optional(),
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
    const detalle = e.detalle ?? null;
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
        createdAt: e.createdAt,
        updatedAt: e.updatedAt,
        solicitante: e.solicitante?.nombre ?? "[Sin solicitante]",
        empresa: e.solicitante?.empresa?.nombre ?? null,
        empresaId: e.solicitante?.empresa?.id_empresa ?? null,
        idSolicitante: e.idSolicitante,
        macWifi: detalle?.macWifi ?? null,
        redEthernet: detalle?.redEthernet ?? null,
        so: detalle?.so ?? null,
        tipoDd: detalle?.tipoDd ?? null,
        estadoAlm: detalle?.estadoAlm ?? null,
        office: detalle?.office ?? null,
        teamViewer: detalle?.teamViewer ?? null,
        claveTv: detalle?.claveTv ?? null,
        revisado: detalle?.revisado ?? null,
        adminRidsUsuario: detalle?.adminRidsUsuario ?? null,
        adminRidsPassword: detalle?.adminRidsPassword ?? null,
        usuarioEmpresa: detalle?.usuarioEmpresa ?? null,
        passwordEmpresa: detalle?.passwordEmpresa ?? null,
        usuarioPersonal: detalle?.usuarioPersonal ?? null,
        passwordPersonal: detalle?.passwordPersonal ?? null,
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
        const user = req.user;
        const where = {
            ...(user?.rol === "CLIENTE"
                ? {
                    solicitante: {
                        is: { empresaId: user.empresaId },
                    },
                }
                : q.empresaId
                    ? {
                        solicitante: {
                            is: { empresaId: q.empresaId },
                        },
                    }
                    : {}),
            ...(q.empresaName
                ? {
                    solicitante: {
                        is: {
                            empresa: {
                                is: { nombre: { contains: q.empresaName, mode: INS } },
                            },
                        },
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
                        ...(Number.isFinite(Number(q.search))
                            ? [{ id_equipo: Number(q.search) }]
                            : []),
                    ],
                }
                : {}),
        };
        const orderBy = mapOrderBy(q.sortBy, q.sortDir);
        const skip = (q.page - 1) * q.pageSize;
        const total = await prisma.equipo.count({ where });
        if (q.mode === "selector") {
            const items = await prisma.equipo.findMany({
                where,
                select: {
                    id_equipo: true,
                    serial: true,
                    marca: true,
                    modelo: true,
                    tipo: true,
                },
                orderBy,
                skip,
                take: q.pageSize,
            });
            return res.json({
                page: q.page,
                pageSize: q.pageSize,
                total,
                totalPages: Math.max(1, Math.ceil(total / q.pageSize)),
                items,
            });
        }
        const rows = await prisma.equipo.findMany({
            where,
            include: { solicitante: { include: { empresa: true } }, detalle: true },
            orderBy,
            skip,
            take: q.pageSize,
        });
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
            return res.status(400).json({
                error: "Parámetros inválidos",
                details: err.flatten(),
            });
        }
        return res.status(500).json({ error: "Error al listar equipos" });
    }
}
/* ================== CREATE (single o bulk) ================== */
export async function createEquipo(req, res) {
    try {
        const parsed = createEquiposRequestSchema.parse(req.body);
        const equiposToCreate = Array.isArray(parsed)
            ? parsed
            : "equipos" in parsed
                ? parsed.equipos
                : [parsed];
        const created = [];
        const errors = [];
        // 🔥 transacción para que sea más estable
        for (const data of equiposToCreate) {
            try {
                const existe = await prisma.equipo.findUnique({
                    where: { serial: data.serial },
                });
                if (existe) {
                    errors.push({
                        serial: data.serial,
                        error: "Ya existe un equipo con ese serial",
                    });
                    continue;
                }
                let idSolicitanteFinal = data.idSolicitante ?? null;
                if (!idSolicitanteFinal && data.empresaId) {
                    idSolicitanteFinal = await ensurePlaceholderSolicitante(data.empresaId);
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
                        // 🔥 AQUÍ VA EL DETALLE
                        detalle: {
                            create: {
                                macWifi: data.macWifi ?? null,
                                redEthernet: data.redEthernet ?? null,
                                so: data.so ?? null,
                                tipoDd: data.tipoDd ?? null,
                                estadoAlm: data.estadoAlm ?? null,
                                office: data.office ?? null,
                                teamViewer: data.teamViewer ?? null,
                                claveTv: data.claveTv ?? null,
                                revisado: data.revisado ?? null,
                                adminRidsUsuario: data.adminRidsUsuario ?? null,
                                adminRidsPassword: data.adminRidsPassword ?? null,
                                usuarioEmpresa: data.usuarioEmpresa ?? null,
                                passwordEmpresa: data.passwordEmpresa ?? null,
                                usuarioPersonal: data.usuarioPersonal ?? null,
                                passwordPersonal: data.passwordPersonal ?? null,
                            },
                        },
                    },
                    include: {
                        solicitante: { include: { empresa: true } },
                        detalle: true,
                    },
                });
                created.push(equipo);
            }
            catch (e) {
                errors.push({
                    serial: data.serial,
                    error: e?.message ?? "Error desconocido",
                });
            }
        }
        clearCache();
        return res.status(201).json({
            ok: true,
            totalReceived: equiposToCreate.length,
            totalCreated: created.length,
            totalErrors: errors.length,
            created,
            errors,
        });
    }
    catch (err) {
        console.error("createEquipo error:", err);
        if (err instanceof z.ZodError) {
            return res.status(400).json({
                error: "Datos inválidos",
                details: err.flatten(),
            });
        }
        return res.status(500).json({ error: "Error al crear equipo(s)" });
    }
}
/* ================== READ ONE ================== */
export async function getEquipoById(req, res) {
    try {
        const id = Number(req.params.id);
        if (!Number.isFinite(id) || id <= 0) {
            return res.status(400).json({ error: "ID inválido" });
        }
        const user = req.user;
        const equipo = await prisma.equipo.findUnique({
            where: { id_equipo: id },
            include: { solicitante: { include: { empresa: true } }, detalle: true },
        });
        if (!equipo)
            return res.status(404).json({ error: "Equipo no encontrado" });
        // ✅ Si es CLIENTE, valida que el equipo sea de su empresa
        if (user?.rol === "CLIENTE") {
            const empresaEquipoId = equipo.solicitante?.empresaId ?? null;
            if (!empresaEquipoId || empresaEquipoId !== user.empresaId) {
                return res.status(403).json({ error: "No autorizado" });
            }
        }
        // ✅ Busca el log CREATE (primero en el tiempo)
        const createLog = await prisma.auditLog.findFirst({
            where: {
                entity: "Equipo",
                entityId: String(id),
                action: AuditAction.CREATE,
                ...(user?.rol === "CLIENTE" ? { empresaId: user.empresaId } : {}),
            },
            include: {
                actor: { select: { id_tecnico: true, nombre: true, email: true } },
            },
            orderBy: { createdAt: "asc" },
        });
        return res.status(200).json({
            ...equipo,
            creadoPor: createLog?.actor
                ? {
                    id_tecnico: createLog.actor.id_tecnico,
                    nombre: createLog.actor.nombre,
                    email: createLog.actor.email,
                }
                : null,
            creadoEn: createLog?.createdAt ?? null,
        });
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
        const { macWifi, redEthernet, so, tipoDd, estadoAlm, office, teamViewer, claveTv, revisado, adminRidsUsuario, adminRidsPassword, usuarioEmpresa, passwordEmpresa, usuarioPersonal, passwordPersonal, ...equipoData } = data;
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
                ...(equipoData.tipo ? { tipo: equipoData.tipo } : {}),
                ...(equipoData.serial ? { serial: equipoData.serial } : {}),
                ...(equipoData.marca ? { marca: equipoData.marca } : {}),
                ...(equipoData.modelo ? { modelo: equipoData.modelo } : {}),
                ...(equipoData.procesador ? { procesador: equipoData.procesador } : {}),
                ...(equipoData.ram ? { ram: equipoData.ram } : {}),
                ...(equipoData.disco ? { disco: equipoData.disco } : {}),
                ...(equipoData.propiedad ? { propiedad: equipoData.propiedad } : {}),
                ...(solicitanteUpdate ? { solicitante: solicitanteUpdate } : {}),
                // 🔥 AQUI VA EL DETALLE
                detalle: {
                    upsert: {
                        create: {
                            macWifi: macWifi ?? null,
                            redEthernet: redEthernet ?? null,
                            so: so ?? null,
                            tipoDd: tipoDd ?? null,
                            estadoAlm: estadoAlm ?? null,
                            office: office ?? null,
                            teamViewer: teamViewer ?? null,
                            claveTv: claveTv ?? null,
                            revisado: revisado ?? null,
                            adminRidsUsuario: adminRidsUsuario ?? null,
                            adminRidsPassword: adminRidsPassword ?? null,
                            usuarioEmpresa: usuarioEmpresa ?? null,
                            passwordEmpresa: passwordEmpresa ?? null,
                            usuarioPersonal: usuarioPersonal ?? null,
                            passwordPersonal: passwordPersonal ?? null,
                        },
                        update: {
                            macWifi: macWifi ?? null,
                            redEthernet: redEthernet ?? null,
                            so: so ?? null,
                            tipoDd: tipoDd ?? null,
                            estadoAlm: estadoAlm ?? null,
                            office: office ?? null,
                            teamViewer: teamViewer ?? null,
                            claveTv: claveTv ?? null,
                            revisado: revisado ?? null,
                            adminRidsUsuario: adminRidsUsuario ?? null,
                            adminRidsPassword: adminRidsPassword ?? null,
                            usuarioEmpresa: usuarioEmpresa ?? null,
                            passwordEmpresa: passwordEmpresa ?? null,
                            usuarioPersonal: usuarioPersonal ?? null,
                            passwordPersonal: passwordPersonal ?? null,
                        },
                    },
                },
            },
            include: {
                solicitante: { include: { empresa: true } },
                detalle: true,
            },
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
/* ================== EQUIPOS POR EMPRESA (MODAL) ================== */
// GET /api/empresas/:empresaId/equipos
export async function getEquiposByEmpresa(req, res) {
    try {
        const empresaId = Number(req.params.empresaId);
        const user = req.user;
        if (user?.rol === "CLIENTE" && empresaId !== user.empresaId) {
            return res.status(403).json({ error: "No autorizado" });
        }
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
const reassignEquiposSchema = z.object({
    equipos: z.array(z.object({
        serial: z.string().trim().min(1),
        idSolicitante: z.coerce.number().int().positive(),
    })).min(1),
});
export async function reassignEquipos(req, res) {
    try {
        const { equipos } = reassignEquiposSchema.parse(req.body);
        const updated = [];
        const errors = [];
        for (const item of equipos) {
            try {
                const equipo = await prisma.equipo.findUnique({
                    where: { serial: item.serial },
                });
                if (!equipo) {
                    errors.push({ serial: item.serial, error: "Equipo no encontrado" });
                    continue;
                }
                const solicitante = await prisma.solicitante.findUnique({
                    where: { id_solicitante: item.idSolicitante },
                });
                if (!solicitante) {
                    errors.push({
                        serial: item.serial,
                        error: `Solicitante ${item.idSolicitante} no existe`,
                    });
                    continue;
                }
                const upd = await prisma.equipo.update({
                    where: { serial: item.serial },
                    data: { idSolicitante: solicitante.id_solicitante },
                });
                updated.push(upd);
            }
            catch (e) {
                errors.push({
                    serial: item.serial,
                    error: e?.message ?? "Error desconocido",
                });
            }
        }
        return res.json({
            ok: true,
            totalReceived: equipos.length,
            totalUpdated: updated.length,
            totalErrors: errors.length,
            updated,
            errors,
        });
    }
    catch (err) {
        if (err instanceof z.ZodError) {
            return res.status(400).json({ error: "Datos inválidos", details: err.flatten() });
        }
        console.error("reassignEquipos error:", err);
        return res.status(500).json({ error: "Error al reasignar equipos" });
    }
}
/* ================== HISTORIAL POR EQUIPO ================== */
// GET /api/equipos/:id/historial
export async function getEquipoHistorial(req, res) {
    try {
        const id = Number(req.params.id);
        if (!Number.isInteger(id) || id <= 0) {
            return res.status(400).json({ error: "ID inválido" });
        }
        const user = req.user;
        // ✅ Busca el id del detalle para cruzar sus logs
        const detalle = await prisma.detalleEquipo.findUnique({
            where: { idEquipo: id },
            select: { id: true },
        });
        const [logsEquipo, logsDetalle] = await Promise.all([
            prisma.auditLog.findMany({
                where: {
                    entity: "Equipo",
                    entityId: String(id),
                    ...(user?.rol === "CLIENTE" ? { empresaId: user.empresaId } : {}),
                },
                include: {
                    actor: { select: { id_tecnico: true, nombre: true, email: true } },
                },
            }),
            // ✅ También trae logs de DetalleEquipo
            detalle
                ? prisma.auditLog.findMany({
                    where: {
                        entity: "DetalleEquipo",
                        entityId: String(detalle.id),
                        ...(user?.rol === "CLIENTE" ? { empresaId: user.empresaId } : {}),
                    },
                    include: {
                        actor: { select: { id_tecnico: true, nombre: true, email: true } },
                    },
                })
                : Promise.resolve([]),
        ]);
        // ✅ Fusiona y ordena por fecha desc
        const merged = [...logsEquipo, ...logsDetalle].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
        return res.json({ total: merged.length, items: merged });
    }
    catch (err) {
        console.error("getEquipoHistorial error:", err);
        return res.status(500).json({ error: "Error al obtener historial del equipo" });
    }
}
//# sourceMappingURL=equipos.controller.js.map