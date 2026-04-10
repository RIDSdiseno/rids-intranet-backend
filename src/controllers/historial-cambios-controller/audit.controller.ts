// src/controllers/audit.controller.ts
import type { Request, Response } from "express";
import { prisma } from "../../lib/prisma.js";

// Controlador para listar logs de auditoría con filtros y paginación
export const listAuditLogs = async (req: Request, res: Response) => {
    try {
        const {
            entity,
            entityId,
            actorId,
            empresaId,
            from,
            to,
            page = "1",
            limit = "50",
        } = req.query;

        const pageNumber = Math.max(Number(page) || 1, 1);
        const pageSize = Math.min(Number(limit) || 50, 200);
        const skip = (pageNumber - 1) * pageSize;

        const where: any = {};

        if (empresaId) where.empresaId = Number(empresaId); // 🔥 AGREGAR

        if (entity) where.entity = String(entity);
        if (entityId) where.entityId = String(entityId);
        if (actorId) where.actorId = Number(actorId);

        if (from || to) {
            where.createdAt = {};
            if (from) where.createdAt.gte = new Date(String(from));
            if (to) where.createdAt.lte = new Date(String(to));
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
    } catch (error) {
        console.error("Error listAuditLogs:", error);
        return res.status(500).json({ error: "Error interno del servidor" });
    }
};

// Controlador para listar logs de auditoría relacionados a una empresa específica
export const listAuditByEmpresa = async (req: Request, res: Response) => {
    try {
        const { empresaId } = req.params;
        const {
            page = "1",
            limit = "50",
        } = req.query;

        const empresaIdNum = Number(empresaId);
        if (!Number.isFinite(empresaIdNum)) {
            return res.status(400).json({ error: "empresaId inválido" });
        }

        const pageNumber = Math.max(Number(page) || 1, 1);
        const pageSize = Math.min(Number(limit) || 50, 200);
        const skip = (pageNumber - 1) * pageSize;

        // 1️⃣ Buscar IDs relacionados
        const [equipos, servidores, solicitantes] = await Promise.all([
            prisma.equipo.findMany({
                where: { solicitante: { empresaId: empresaIdNum } },
                select: { id_equipo: true },
            }),
            prisma.servidor.findMany({
                where: { empresaId: empresaIdNum },
                select: { id: true },
            }),
            prisma.solicitante.findMany({
                where: { empresaId: empresaIdNum },
                select: { id_solicitante: true },
            }),
        ]);

        const equipoIds = equipos.map(e => String(e.id_equipo));
        const servidorIds = servidores.map(s => String(s.id));
        const solicitanteIds = solicitantes.map(s => String(s.id_solicitante));

        // 2️⃣ Armar filtro OR consolidado
        const where: any = {
            OR: [
                { empresaId: empresaIdNum },
                { entity: "Empresa", entityId: String(empresaIdNum) },

                ...(solicitanteIds.length
                    ? [{ entity: "Solicitante", entityId: { in: solicitanteIds } }]
                    : []),

                ...(equipoIds.length
                    ? [{ entity: "Equipo", entityId: { in: equipoIds } }]
                    : []),

                ...(servidorIds.length
                    ? [{ entity: "Servidor", entityId: { in: servidorIds } }]
                    : []),
            ],
        };
        
        // 3️⃣ Consultar logs con el filtro consolidado
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
    } catch (error) {
        console.error("Error listAuditByEmpresa:", error);
        return res.status(500).json({ error: "Error interno del servidor" });
    }
};