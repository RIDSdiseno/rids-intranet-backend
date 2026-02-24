import { prisma } from "../../lib/prisma.js";
export const listAuditLogs = async (req, res) => {
    try {
        const { entity, entityId, actorId, empresaId, action, search, from, to, page = "1", limit = "50", } = req.query;
        const pageNumber = Math.max(Number(page) || 1, 1);
        const pageSize = Math.min(Number(limit) || 50, 200);
        const skip = (pageNumber - 1) * pageSize;
        const where = {};
        // 🔹 Filtros simples
        if (empresaId)
            where.empresaId = Number(empresaId);
        if (entity)
            where.entity = String(entity);
        if (entityId)
            where.entityId = String(entityId);
        if (actorId)
            where.actorId = Number(actorId);
        if (action)
            where.action = String(action); // 🔥 NUEVO
        // 🔹 Rango de fechas
        if (from || to) {
            where.createdAt = {};
            if (from)
                where.createdAt.gte = new Date(String(from));
            if (to)
                where.createdAt.lte = new Date(String(to));
        }
        // 🔹 Buscar dentro de cambios (JSON)
        if (search) {
            const searchValue = String(search);
            where.AND = [
                ...(where.AND || []),
                {
                    OR: [
                        { entity: { contains: searchValue, mode: "insensitive" } },
                        { action: { contains: searchValue, mode: "insensitive" } },
                        {
                            changes: {
                                string_contains: searchValue,
                            },
                        },
                    ],
                },
            ];
        }
        const [logs, total] = await Promise.all([
            prisma.auditLog.findMany({
                where,
                orderBy: { createdAt: "desc" },
                skip,
                take: pageSize,
                include: {
                    actor: {
                        select: {
                            id_tecnico: true,
                            nombre: true,
                            email: true,
                        },
                    },
                },
            }),
            prisma.auditLog.count({ where }),
        ]);
        return res.json({
            page: pageNumber,
            limit: pageSize,
            total,
            pages: Math.ceil(total / pageSize),
            data: logs,
        });
    }
    catch (error) {
        console.error("Error listAuditLogs:", error);
        return res.status(500).json({ error: "Error interno del servidor" });
    }
};
export const listAuditByEmpresa = async (req, res) => {
    req.query.empresaId = req.params.empresaId;
    return listAuditLogs(req, res);
};
//# sourceMappingURL=audit.controller.js.map