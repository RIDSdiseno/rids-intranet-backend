import { PrismaClient, AuditAction } from "@prisma/client";
import { getCurrentUserId } from "../lib/request-context.js";
const prismaBase = new PrismaClient({
    log: process.env.NODE_ENV === "development"
        ? ["query", "error", "warn"]
        : ["error"],
});
/* =========================
   EXTRAER ID DINÁMICAMENTE
========================= */
function extractId(obj) {
    if (!obj)
        return "unknown";
    for (const key of Object.keys(obj)) {
        if (key.toLowerCase().startsWith("id")) {
            return String(obj[key]);
        }
    }
    return "unknown";
}
/* =========================
   DIFF SEGURO
========================= */
function diffObjects(before, after) {
    const changes = {};
    if (!before || !after)
        return changes;
    const isPrimitive = (val) => val === null ||
        typeof val === "string" ||
        typeof val === "number" ||
        typeof val === "boolean";
    for (const key in after) {
        if (key === "updatedAt" || key === "actualizadaEn")
            continue;
        const beforeVal = before[key];
        const afterVal = after[key];
        // 🔥 Solo comparar primitivos
        if (!isPrimitive(afterVal))
            continue;
        if (beforeVal !== afterVal) {
            changes[key] = {
                before: beforeVal ?? null,
                after: afterVal ?? null,
            };
        }
    }
    return changes;
}
function sanitizeForAudit(obj) {
    if (!obj)
        return {};
    const clean = {};
    const isPrimitive = (val) => val === null ||
        typeof val === "string" ||
        typeof val === "number" ||
        typeof val === "boolean";
    for (const key in obj) {
        if (isPrimitive(obj[key])) {
            clean[key] = obj[key];
        }
    }
    return clean;
}
async function resolveEmpresaId(model, record, before = null) {
    const r = record ?? before;
    if (!r)
        return null;
    // ✅ directos (la mayoría de tus modelos “empresa” lo tienen)
    if (typeof r.empresaId === "number")
        return r.empresaId;
    // ✅ Empresa / DetalleEmpresa (nombres especiales)
    if (model === "Empresa" && typeof r.id_empresa === "number")
        return r.id_empresa;
    if (model === "DetalleEmpresa" && typeof r.empresa_id === "number")
        return r.empresa_id;
    // ✅ Fichas (empresaId directo)
    if (model === "FichaEmpresa" && typeof r.empresaId === "number")
        return r.empresaId;
    if (model === "FichaTecnicaEmpresa" && typeof r.empresaId === "number")
        return r.empresaId;
    // ✅ ChecklistGestionEmpresa -> fichaEmpresaId -> FichaEmpresa.empresaId
    if (model === "ChecklistGestionEmpresa" && typeof r.fichaEmpresaId === "number") {
        const ficha = await prismaBase.fichaEmpresa.findUnique({
            where: { id: r.fichaEmpresaId },
            select: { empresaId: true },
        });
        return ficha?.empresaId ?? null;
    }
    // ✅ RedSucursal / AccesoRouterSucursal -> sucursalId -> Sucursal.empresaId
    if ((model === "RedSucursal" || model === "AccesoRouterSucursal") && typeof r.sucursalId === "number") {
        const suc = await prismaBase.sucursal.findUnique({
            where: { id_sucursal: r.sucursalId },
            select: { empresaId: true },
        });
        return suc?.empresaId ?? null;
    }
    // ResponsableSucursal -> sucursalId -> Sucursal.empresaId
    if (model === "ResponsableSucursal" && typeof r.sucursalId === "number") {
        const suc = await prismaBase.sucursal.findUnique({
            where: { id_sucursal: r.sucursalId },
            select: { empresaId: true },
        });
        return suc?.empresaId ?? null;
    }
    // ContactoEmpresa -> si no trae empresaId, resolver por sucursalId
    if (model === "ContactoEmpresa" && typeof r.sucursalId === "number") {
        const suc = await prismaBase.sucursal.findUnique({
            where: { id_sucursal: r.sucursalId },
            select: { empresaId: true },
        });
        return suc?.empresaId ?? null;
    }
    // ✅ ServidorUsuario -> servidorId -> Servidor.empresaId
    if (model === "ServidorUsuario" && typeof r.servidorId === "number") {
        const srv = await prismaBase.servidor.findUnique({
            where: { id: r.servidorId },
            select: { empresaId: true },
        });
        return srv?.empresaId ?? null;
    }
    // ✅ Equipo -> idSolicitante -> Solicitante.empresaId
    if (model === "Equipo") {
        const idSol = r.idSolicitante ?? before?.idSolicitante;
        if (typeof idSol === "number") {
            const sol = await prismaBase.solicitante.findUnique({
                where: { id_solicitante: idSol },
                select: { empresaId: true },
            });
            return sol?.empresaId ?? null;
        }
    }
    // ✅ Historial: a veces empresaId puede venir null, pero si viene sucursalId se puede resolver
    if (model === "Historial" && typeof r.sucursalId === "number") {
        const suc = await prismaBase.sucursal.findUnique({
            where: { id_sucursal: r.sucursalId },
            select: { empresaId: true },
        });
        return suc?.empresaId ?? null;
    }
    // ✅ Visita: igual fallback por sucursalId
    if (model === "Visita" && typeof r.sucursalId === "number") {
        const suc = await prismaBase.sucursal.findUnique({
            where: { id_sucursal: r.sucursalId },
            select: { empresaId: true },
        });
        return suc?.empresaId ?? null;
    }
    // ✅ MantencionRemota: trae empresaId (si no vino por record, ya lo intentamos arriba)
    // nada extra aquí
    return null;
}
/* =========================
   EXTENSION GLOBAL AUTOMÁTICA
========================= */
export const prisma = prismaBase.$extends({
    query: {
        $allModels: {
            async create({ model, args, query }) {
                const result = await query(args);
                if (!model || model === "AuditLog")
                    return result;
                const r = result;
                const empresaId = await resolveEmpresaId(model, r, null);
                const actor = getCurrentUserId();
                console.log("[AUDIT] model:", model, "actor:", actor);
                await prismaBase.auditLog.create({
                    data: {
                        entity: model,
                        entityId: extractId(r),
                        empresaId,
                        action: "CREATE",
                        changes: sanitizeForAudit(r),
                        actorId: getCurrentUserId(),
                    },
                });
                return result;
            },
            async update({ model, args, query }) {
                if (!model || model === "AuditLog") {
                    return query(args);
                }
                const delegate = prismaBase[model.charAt(0).toLowerCase() + model.slice(1)];
                let before = null;
                if (model === "Equipo") {
                    before = await delegate.findUnique({
                        where: args.where,
                        include: { detalle: true },
                    });
                }
                else {
                    before = await delegate.findUnique({
                        where: args.where,
                    });
                }
                const result = await query(args);
                const r = result;
                let changes = diffObjects(sanitizeForAudit(before), sanitizeForAudit(r));
                // 🔥 Detectar cambios en detalle (Equipo)
                if (model === "Equipo") {
                    const beforeDetalle = before?.detalle ?? {};
                    const afterDetalle = r?.detalle ?? {};
                    const detalleChanges = diffObjects(sanitizeForAudit(beforeDetalle), sanitizeForAudit(afterDetalle));
                    if (Object.keys(detalleChanges).length > 0) {
                        changes = {
                            ...changes,
                            ...detalleChanges,
                        };
                    }
                }
                // 🔥 Mejora para Equipo → traducir idSolicitante a nombres
                if (model === "Equipo" && changes.idSolicitante) {
                    const beforeId = changes.idSolicitante.before;
                    const afterId = changes.idSolicitante.after;
                    const [beforeSol, afterSol] = await Promise.all([
                        beforeId
                            ? prismaBase.solicitante.findUnique({
                                where: { id_solicitante: beforeId },
                                select: { nombre: true },
                            })
                            : null,
                        afterId
                            ? prismaBase.solicitante.findUnique({
                                where: { id_solicitante: afterId },
                                select: { nombre: true },
                            })
                            : null,
                    ]);
                    changes = {
                        ...changes,
                        solicitante: {
                            before: beforeSol?.nombre ?? "Sin solicitante",
                            after: afterSol?.nombre ?? "Sin solicitante",
                        },
                    };
                    delete changes.idSolicitante; // 🔥 eliminamos el cambio numérico
                }
                const empresaId = await resolveEmpresaId(model, r, before);
                const actor = getCurrentUserId();
                console.log("[AUDIT] model:", model, "actor:", actor);
                if (Object.keys(changes).length > 0) {
                    await prismaBase.auditLog.create({
                        data: {
                            entity: model,
                            entityId: extractId(r),
                            empresaId,
                            action: "UPDATE",
                            changes: JSON.parse(JSON.stringify(changes)),
                            actorId: getCurrentUserId(),
                        },
                    });
                }
                return result;
            },
            async delete({ model, args, query }) {
                if (!model || model === "AuditLog") {
                    return query(args);
                }
                const delegate = prismaBase[model.charAt(0).toLowerCase() + model.slice(1)];
                let before = null;
                if (args?.where) {
                    before = await delegate.findUnique({
                        where: args.where,
                    });
                }
                const result = await query(args);
                const empresaId = await resolveEmpresaId(model, null, before);
                const actor = getCurrentUserId();
                console.log("[AUDIT] model:", model, "actor:", actor);
                await prismaBase.auditLog.create({
                    data: {
                        entity: model,
                        entityId: before ? extractId(before) : "unknown",
                        empresaId,
                        action: "DELETE",
                        changes: sanitizeForAudit(before),
                        actorId: getCurrentUserId(),
                    },
                });
                return result;
            },
            async upsert({ model, args, query }) {
                if (!model || model === "AuditLog") {
                    return query(args);
                }
                const delegate = prismaBase[model.charAt(0).toLowerCase() + model.slice(1)];
                let before = null;
                if (args?.where) {
                    before = await delegate.findUnique({
                        where: args.where,
                    });
                }
                const result = await query(args);
                const r = result;
                const empresaId = await resolveEmpresaId(model, r, before);
                if (before) {
                    // era update
                    const changes = diffObjects(sanitizeForAudit(before), sanitizeForAudit(r));
                    if (Object.keys(changes).length > 0) {
                        await prismaBase.auditLog.create({
                            data: {
                                entity: model,
                                entityId: extractId(r),
                                empresaId,
                                action: "UPDATE",
                                changes,
                                actorId: getCurrentUserId(),
                            },
                        });
                    }
                }
                else {
                    // era create
                    await prismaBase.auditLog.create({
                        data: {
                            entity: model,
                            entityId: extractId(r),
                            empresaId,
                            action: "CREATE",
                            changes: sanitizeForAudit(r),
                            actorId: getCurrentUserId(),
                        },
                    });
                }
                return result;
            },
        },
    },
});
//# sourceMappingURL=prisma.js.map