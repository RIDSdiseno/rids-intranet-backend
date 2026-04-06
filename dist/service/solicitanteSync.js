import { prisma } from "../lib/prisma.js";
import { bus } from "../lib/events.js";
/* ========== Helpers ========== */
const norm = (e) => (e ? e.trim().toLowerCase() : null);
const buildNombre = (u, emailNorm) => u.name?.fullName ||
    `${u.name?.givenName ?? ""} ${u.name?.familyName ?? ""}`.trim() ||
    (emailNorm ?? "Sin nombre");
/* ==============================================================
   Versión mínima (usada por compatibilidad)
   ==============================================================
   - Upsert por (empresaId, email)
   - Actualiza nombre solo si cambia
   - Crea si no existe
   - Marca accountType = "google"
   - Setea googleUserId si viene y falta
================================================================= */
export async function upsertSolicitanteFromGoogle_min(user, empresaId) {
    const email = norm(user.primaryEmail);
    if (!email)
        return null;
    const nombre = buildNombre(user, email);
    const activo = !(user.suspended ?? false);
    // 1) Buscar primero por googleUserId
    if (user.id) {
        const byGoogle = await prisma.solicitante.findUnique({
            where: { googleUserId: user.id },
        });
        if (byGoogle) {
            const changes = {};
            if (byGoogle.nombre !== nombre)
                changes.nombre = nombre;
            if (byGoogle.email !== email)
                changes.email = email;
            if (byGoogle.empresaId !== empresaId)
                changes.empresaId = empresaId;
            if (byGoogle.isActive !== activo)
                changes.isActive = activo;
            if (byGoogle.accountType !== "google")
                changes.accountType = "google";
            if (Object.keys(changes).length === 0)
                return byGoogle;
            const updated = await prisma.solicitante.update({
                where: { id_solicitante: byGoogle.id_solicitante },
                data: changes,
            });
            bus.emit("solicitante.updated", updated);
            return updated;
        }
    }
    // 2) Buscar por empresaId + email
    const existing = await prisma.solicitante.findFirst({
        where: { empresaId, email },
        orderBy: { id_solicitante: "asc" },
    });
    if (existing) {
        const changes = {};
        if (existing.nombre !== nombre)
            changes.nombre = nombre;
        if (!existing.googleUserId && user.id)
            changes.googleUserId = user.id;
        if (existing.isActive !== activo)
            changes.isActive = activo;
        if (existing.accountType !== "google")
            changes.accountType = "google";
        if (Object.keys(changes).length === 0)
            return existing;
        const updated = await prisma.solicitante.update({
            where: { id_solicitante: existing.id_solicitante },
            data: changes,
        });
        bus.emit("solicitante.updated", updated);
        return updated;
    }
    // 3) Crear con blindaje por carrera
    try {
        const created = await prisma.solicitante.create({
            data: {
                nombre,
                email,
                empresaId,
                accountType: "google",
                googleUserId: user.id || null,
                isActive: activo,
            },
        });
        bus.emit("solicitante.created", created);
        return created;
    }
    catch (e) {
        if (e?.code === "P2002" && user.id) {
            const already = await prisma.solicitante.findUnique({
                where: { googleUserId: user.id },
            });
            if (already) {
                const updated = await prisma.solicitante.update({
                    where: { id_solicitante: already.id_solicitante },
                    data: {
                        nombre,
                        email,
                        empresaId,
                        accountType: "google",
                        isActive: activo,
                    },
                });
                bus.emit("solicitante.updated", updated);
                return updated;
            }
        }
        throw e;
    }
}
/** Alias para compatibilidad */
export { upsertSolicitanteFromGoogle_full as upsertSolicitanteFromGoogle };
/* ==============================================================
   Versión full (recomendada)
   ==============================================================
   - Busca primero por googleUserId, luego (empresaId,email)
   - Sincroniza estado activo según suspended
   - Solo escribe si hay cambios
   - Emite eventos (created/updated)
================================================================= */
export async function upsertSolicitanteFromGoogle_full(user, empresaId) {
    const email = norm(user.primaryEmail);
    const nombre = buildNombre(user, email);
    const activo = !(user.suspended ?? false);
    // 1️⃣ Buscar por googleUserId (más confiable si ya se sincronizó)
    if (user.id) {
        const byGoogle = await prisma.solicitante.findUnique({
            where: { googleUserId: user.id },
        });
        if (byGoogle) {
            const changes = {};
            if (byGoogle.nombre !== nombre)
                changes.nombre = nombre;
            if (byGoogle.email !== email)
                changes.email = email;
            if (byGoogle.empresaId !== empresaId)
                changes.empresaId = empresaId;
            if (byGoogle.isActive !== activo)
                changes.isActive = activo;
            if (byGoogle.accountType !== "google")
                changes.accountType = "google";
            if (Object.keys(changes).length === 0)
                return byGoogle;
            const updated = await prisma.solicitante.update({
                where: { id_solicitante: byGoogle.id_solicitante },
                data: changes,
            });
            bus.emit("solicitante.updated", updated);
            return updated;
        }
    }
    // 2️⃣ Buscar por (empresaId, email)
    if (email) {
        const match = await prisma.solicitante.findFirst({
            where: { empresaId, email },
            orderBy: { id_solicitante: "asc" },
        });
        if (match) {
            const changes = {};
            if (!match.googleUserId && user.id)
                changes.googleUserId = user.id;
            if (match.nombre !== nombre)
                changes.nombre = nombre;
            if (match.isActive !== activo)
                changes.isActive = activo;
            if (match.accountType !== "google")
                changes.accountType = "google";
            if (Object.keys(changes).length === 0)
                return match;
            const updated = await prisma.solicitante.update({
                where: { id_solicitante: match.id_solicitante },
                data: changes,
            });
            bus.emit("solicitante.updated", updated);
            return updated;
        }
    }
    // 3️⃣ Crear nuevo registro
    const created = await prisma.solicitante.create({
        data: {
            nombre,
            email,
            empresaId,
            googleUserId: user.id,
            isActive: activo,
            accountType: "google",
        },
    });
    bus.emit("solicitante.created", created);
    return created;
}
// Función de retry genérica para operaciones con prisma, con backoff exponencial
export async function deactivateMissingGoogleSolicitantes(empresaId, googleIdsVigentes) {
    const ids = googleIdsVigentes
        .map((x) => x?.trim())
        .filter(Boolean);
    if (!ids.length) {
        return { count: 0, users: [] };
    }
    const usersToDeactivate = await prisma.solicitante.findMany({
        where: {
            empresaId,
            accountType: "google",
            googleUserId: { not: null },
            isActive: true,
            NOT: {
                googleUserId: { in: ids },
            },
            equipos: {
                none: {},
            },
        },
        select: {
            id_solicitante: true,
            nombre: true,
            email: true,
            googleUserId: true,
            empresaId: true,
        },
        orderBy: { nombre: "asc" },
    });
    const result = await prisma.solicitante.updateMany({
        where: {
            id_solicitante: {
                in: usersToDeactivate.map((u) => u.id_solicitante),
            },
        },
        data: {
            isActive: false,
        },
    });
    return {
        count: result.count,
        users: usersToDeactivate,
    };
}
//# sourceMappingURL=solicitanteSync.js.map