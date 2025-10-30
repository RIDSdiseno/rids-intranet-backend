import { prisma } from "../lib/prisma.js";
import { bus } from "../lib/events.js";

/** Shape mínimo que usamos del Directory API */
export type GoogleUser = {
  id: string; // Google Directory user id
  primaryEmail: string;
  name?: { fullName?: string; givenName?: string; familyName?: string };
  suspended?: boolean;
};

/* ========== Helpers ========== */
const norm = (e?: string | null) => (e ? e.trim().toLowerCase() : null);

const buildNombre = (u: GoogleUser, emailNorm?: string | null) =>
  u.name?.fullName ||
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
export async function upsertSolicitanteFromGoogle_min(
  user: GoogleUser,
  empresaId: number
) {
  const email = norm(user.primaryEmail);
  if (!email) return null;

  const nombre = buildNombre(user, email);

  const existing = await prisma.solicitante.findFirst({
    where: { empresaId, email },
    orderBy: { id_solicitante: "asc" },
  });

  if (existing) {
    const changes: any = {};
    if (existing.nombre !== nombre) changes.nombre = nombre;
    if (!existing.accountType) changes.accountType = "google";
    if (!existing.googleUserId && user.id) changes.googleUserId = user.id;

    if (Object.keys(changes).length === 0) return existing;

    const updated = await prisma.solicitante.update({
      where: { id_solicitante: existing.id_solicitante },
      data: changes,
    });
    bus.emit("solicitante.updated", updated);
    return updated;
  }

  const created = await prisma.solicitante.create({
    data: {
      nombre,
      email,
      empresaId,
      accountType: "google",
      googleUserId: user.id || null,
    } as any,
  });
  bus.emit("solicitante.created", created);
  return created;
}

/** Alias para compatibilidad */
export { upsertSolicitanteFromGoogle_min as upsertSolicitanteFromGoogle };

/* ==============================================================
   Versión full (recomendada)
   ==============================================================
   - Busca primero por googleUserId, luego (empresaId,email)
   - Sincroniza estado activo según suspended
   - Solo escribe si hay cambios
   - Emite eventos (created/updated)
================================================================= */
export async function upsertSolicitanteFromGoogle_full(
  user: GoogleUser,
  empresaId: number
) {
  const email = norm(user.primaryEmail);
  const nombre = buildNombre(user, email);
  const activo = !(user.suspended ?? false);

  // 1️⃣ Buscar por googleUserId (más confiable si ya se sincronizó)
  if (user.id) {
    const byGoogle = await prisma.solicitante.findUnique({
      where: { googleUserId: user.id } as any,
    });

    if (byGoogle) {
      const changes: any = {};
      if (byGoogle.nombre !== nombre) changes.nombre = nombre;
      if (byGoogle.email !== email) changes.email = email;
      if (byGoogle.empresaId !== empresaId) changes.empresaId = empresaId;
      if (byGoogle.isActive !== activo) changes.isActive = activo;
      if (byGoogle.accountType !== "google") changes.accountType = "google";

      if (Object.keys(changes).length === 0) return byGoogle;

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
      const changes: any = {};
      if (!match.googleUserId && user.id) changes.googleUserId = user.id;
      if (match.nombre !== nombre) changes.nombre = nombre;
      if (match.isActive !== activo) changes.isActive = activo;
      if (match.accountType !== "google") changes.accountType = "google";

      if (Object.keys(changes).length === 0) return match;

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
    } as any,
  });

  bus.emit("solicitante.created", created);
  return created;
}
