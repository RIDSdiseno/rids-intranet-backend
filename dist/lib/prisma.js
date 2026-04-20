import { PrismaClient } from "@prisma/client";
import { getCurrentUserId } from "../lib/request-context.js";
const prismaBase = new PrismaClient({
//log:
//process.env.NODE_ENV === "development"
//  ? ["query", "error", "warn"]
//  : ["error"],
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
        if (key === "updatedAt")
            continue; // opcional ignorar
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
// --- Helper para sanitizar objetos antes de guardarlos en AuditLog (solo primitivos) ---
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
// --- Helper reutilizable ---
async function getNombreSolicitante(id) {
    if (!id)
        return null;
    const sol = await prismaBase.solicitante.findUnique({
        where: { id_solicitante: Number(id) },
        select: { nombre: true }
    });
    return sol?.nombre || null;
}
function formatAdicionalesForAudit(adicionales) {
    if (!Array.isArray(adicionales) || adicionales.length === 0)
        return null;
    return adicionales
        .map((a) => {
        const tipo = a?.tipo ?? "OTRO";
        const cantidad = Number(a?.cantidad) > 0 ? Number(a.cantidad) : 1;
        const descripcion = a?.descripcion?.trim();
        return descripcion
            ? `${tipo} (${descripcion}) x${cantidad}`
            : `${tipo} x${cantidad}`;
    })
        .join(" | ");
}
/* =========================
   EXTENSION GLOBAL AUTOMÁTICA
========================= */
export const prisma = prismaBase.$extends({
    query: {
        $allModels: {
            async create({ model, args, query }) {
                const actorId = getCurrentUserId();
                const result = await query(args);
                if (!model || model === "AuditLog")
                    return result;
                const r = result;
                // 1. Preparamos los datos básicos con sanitizeForAudit
                let auditChanges = sanitizeForAudit(r);
                // 2. ENRIQUECIMIENTO: Si es Historial, buscamos el nombre del solicitante
                // Esto inyecta el nombre en el log sin tocar el frontend
                if (model === "Historial" && r.solicitanteId) {
                    const nombre = await getNombreSolicitante(r.solicitanteId);
                    if (nombre)
                        auditChanges.nombreSolicitante = nombre;
                }
                // NUEVA LÓGICA: Si estás creando un Solicitante, captura su nombre directamente
                if (model?.toLowerCase() === "solicitante" && r.nombre) {
                    auditChanges.nombreSolicitante = r.nombre;
                }
                // 3. Lógica original para obtener empresaId
                let empresaId = null;
                if (model === "Equipo") {
                    const equipoFull = await prismaBase.equipo.findUnique({
                        where: { id_equipo: r.id_equipo },
                        include: { solicitante: true },
                    });
                    empresaId = equipoFull?.solicitante?.empresaId ?? null;
                }
                else if (model?.toLowerCase() === "solicitante") {
                    empresaId = r.empresaId ?? null;
                }
                else if (model === "Empresa") {
                    empresaId = r.id_empresa ?? null;
                }
                if (model === "DetalleEquipo") {
                    const equipo = await prismaBase.equipo.findUnique({
                        where: { id_equipo: r.idEquipo },
                        include: { solicitante: true },
                    });
                    empresaId = equipo?.solicitante?.empresaId ?? null;
                }
                // 4. Guardamos el log con los cambios ya enriquecidos
                await prismaBase.auditLog.create({
                    data: {
                        entity: model,
                        entityId: extractId(r),
                        empresaId,
                        action: "CREATE",
                        changes: auditChanges, // Usamos el objeto modificado
                        actorId,
                    },
                });
                return result;
            },
            // --- Lógica similar para UPDATE, con enriquecimiento previo ---
            async update({ model, args, query }) {
                const actorId = getCurrentUserId();
                if (!model || model === "AuditLog") {
                    return query(args);
                }
                const delegate = prismaBase[model.charAt(0).toLowerCase() + model.slice(1)];
                let before = null;
                if (args?.where) {
                    if (model === "Equipo") {
                        before = await prismaBase.equipo.findUnique({
                            where: args.where,
                            include: { detalle: true, adicionales: true },
                        });
                    }
                    else if (model === "DetalleEquipo") {
                        before = await prismaBase.detalleEquipo.findUnique({
                            where: args.where,
                        });
                    }
                    else {
                        before = await delegate.findUnique({
                            where: args.where,
                        });
                    }
                }
                const result = await query(args);
                const r = result;
                let afterSource = r;
                if (model === "Equipo") {
                    afterSource = await prismaBase.equipo.findUnique({
                        where: { id_equipo: r.id_equipo },
                        include: { detalle: true, adicionales: true },
                    });
                }
                const after = model === "Equipo"
                    ? sanitizeForAudit({
                        ...afterSource,
                        ...(afterSource?.detalle ?? {}),
                        adicionalesResumen: formatAdicionalesForAudit(afterSource?.adicionales),
                    })
                    : sanitizeForAudit(r);
                const beforeClean = model === "Equipo"
                    ? sanitizeForAudit({
                        ...before,
                        ...(before?.detalle ?? {}),
                        adicionalesResumen: formatAdicionalesForAudit(before?.adicionales),
                    })
                    : sanitizeForAudit(before);
                const changes = diffObjects(beforeClean, after);
                if (model === "Equipo") {
                    const oldId = before?.idSolicitante;
                    const newId = r?.idSolicitante;
                    if (oldId !== newId) {
                        const [oldName, newName] = await Promise.all([
                            getNombreSolicitante(oldId),
                            getNombreSolicitante(newId),
                        ]);
                        // Reemplaza el cambio de ID por nombres legibles
                        delete changes.idSolicitante;
                        changes["Id Solicitante"] = { before: oldName ?? oldId, after: newName ?? newId };
                    }
                }
                if (Object.keys(changes).length === 0) {
                    return result;
                }
                if (model === "Historial") {
                    const oldId = before?.solicitanteId;
                    const newId = r?.solicitanteId;
                    // Solo procesamos si hay IDs involucrados
                    if (oldId || newId) {
                        const oldName = await getNombreSolicitante(oldId);
                        const newName = await getNombreSolicitante(newId);
                        // Solo agregamos al log si el nombre cambió o si se está creando/vinculando por primera vez
                        if (oldName !== newName) {
                            changes.nombreSolicitante = {
                                before: oldName,
                                after: newName,
                            };
                        }
                    }
                }
                let empresaId = null;
                if (model === "Equipo" && before?.idSolicitante) {
                    const solicitante = await prismaBase.solicitante.findUnique({
                        where: { id_solicitante: before.idSolicitante },
                    });
                    empresaId = solicitante?.empresaId ?? null;
                }
                if (model?.toLowerCase() === "solicitante") {
                    empresaId = before?.empresaId ?? null;
                }
                if (model === "Empresa") {
                    empresaId = before?.id_empresa ?? null;
                }
                if (model === "DetalleEquipo") {
                    const equipo = await prismaBase.equipo.findUnique({
                        where: { id_equipo: before?.idEquipo },
                        include: { solicitante: true },
                    });
                    empresaId = equipo?.solicitante?.empresaId ?? null;
                }
                await prismaBase.auditLog.create({
                    data: {
                        entity: model,
                        entityId: extractId(r),
                        empresaId,
                        action: "UPDATE",
                        changes: JSON.parse(JSON.stringify(changes)),
                        actorId,
                    },
                });
                return result;
            },
            // --- NUEVO MÉTODO PARA DELETE, con lógica similar pero adaptada ---
            async delete({ model, args, query }) {
                const actorId = getCurrentUserId();
                if (!model || model === "AuditLog") {
                    return query(args);
                }
                if (model?.toLowerCase() === "solicitante") {
                    const before = await prismaBase.solicitante.findUnique({
                        where: args.where,
                    });
                    const result = await prismaBase.solicitante.update({
                        where: args.where,
                        data: { isActive: false },
                    });
                    await prismaBase.auditLog.create({
                        data: {
                            entity: model,
                            entityId: before ? extractId(before) : "unknown",
                            empresaId: before?.empresaId ?? null,
                            action: "DELETE",
                            changes: sanitizeForAudit(before),
                            actorId,
                        },
                    });
                    return result;
                }
                const delegate = prismaBase[model.charAt(0).toLowerCase() + model.slice(1)];
                let before = null;
                if (args?.where) {
                    before = await delegate.findUnique({
                        where: args.where,
                    });
                }
                const result = await query(args);
                // --- ESTO ES LO QUE CAMBIA: Enriquecimiento para el DELETE ---
                let auditChanges = sanitizeForAudit(before);
                if (model === "Historial" && before?.solicitanteId) {
                    const nombre = await getNombreSolicitante(before.solicitanteId);
                    if (nombre)
                        auditChanges.nombreSolicitante = nombre;
                }
                // -------------------------------------------------------------
                let empresaId = null;
                if (model === "Equipo" && before?.idSolicitante) {
                    const solicitante = await prismaBase.solicitante.findUnique({
                        where: { id_solicitante: before.idSolicitante },
                    });
                    empresaId = solicitante?.empresaId ?? null;
                }
                else if (model?.toLowerCase() === "solicitante") {
                    empresaId = before?.empresaId ?? null;
                }
                else if (model === "Empresa") {
                    empresaId = before?.id_empresa ?? null;
                }
                if (model === "DetalleEquipo") {
                    const equipo = await prismaBase.equipo.findUnique({
                        where: { id_equipo: before?.idEquipo }, // ← before sí existe
                        include: { solicitante: true },
                    });
                    empresaId = equipo?.solicitante?.empresaId ?? null;
                }
                // Guardamos el log con los cambios ya enriquecidos
                await prismaBase.auditLog.create({
                    data: {
                        entity: model,
                        entityId: before ? extractId(before) : "unknown",
                        empresaId,
                        action: "DELETE",
                        // --- USAMOS LA VARIABLE ENRIQUECIDA ---
                        changes: auditChanges,
                        // -------------------------------------
                        actorId,
                    },
                });
                return result;
            },
        },
    },
});
//# sourceMappingURL=prisma.js.map