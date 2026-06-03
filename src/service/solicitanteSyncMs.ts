// src/service/solicitanteSyncMs.ts
import { prisma } from "../lib/prisma.js";

export type MsUserInput = {
  id: string;
  email: string | null;
  name: string; // string obligatorio aquí
  suspended: boolean;
  licenses: Array<{
    skuId: string;
    skuPartNumber: string;
    displayName?: string;
  }>;
};

// Pequeño helper de retries para errores transitorios (deadlock / tx cerrada)
async function retry<T>(
  fn: () => Promise<T>,
  {
    retries = 5,
    baseDelayMs = 500,
  }: { retries?: number; baseDelayMs?: number } = {}
): Promise<T> {
  let lastErr: unknown;
  for (let i = 0; i <= retries; i++) {
    try {
      return await fn();
    } catch (e: any) {
      lastErr = e;
      const msg = String(e?.message || "");
      const pgCode = e?.code ?? e?.meta?.code;

      // deadlock 40P01 o transacción cerrada → reintentar
      const transient =
        msg.includes("deadlock detected") ||
        msg.includes("Transaction already closed") ||
        msg.includes("Unable to start a transaction") ||
        pgCode === "40P01" ||
        e?.code === "P2028";

      if (!transient || i === retries) break;

      const delay = baseDelayMs * Math.pow(2, i);
      await new Promise((r) => setTimeout(r, delay));
    }
  }
  throw lastErr;
}

/**
 * Upsert principal (sin upserts de SKUs aquí).
 * - El catálogo de SKUs se pre-crea en lote desde el router.
 * - Transacción solo para Solicitante + diff de licencias.
 * - Timeout e isolationLevel ajustados para reducir deadlocks.
 * - Retries ante deadlocks/tx cerrada.
 *
 * Devuelve: { solicitante, created }
 */
export async function upsertSolicitanteFromMicrosoft(u: MsUserInput, empresaId: number) {
  const cleanEmail = (u.email || "").trim().toLowerCase() || null;
  const cleanName = (u.name || "").trim() || "Usuario";
  const active = !u.suspended;

  return await retry(async () => {
    return prisma.$transaction(
      async (tx) => {
        const byMs = await tx.solicitante.findUnique({
          where: { microsoftUserId: u.id },
          select: { id_solicitante: true },
        });

        let targetId: number | null = byMs?.id_solicitante ?? null;

        if (!targetId && cleanEmail) {
          const byEmailSameEmpresa = await tx.solicitante.findFirst({
            where: { email: cleanEmail, empresaId },
            select: { id_solicitante: true },
          });

          if (byEmailSameEmpresa) {
            targetId = byEmailSameEmpresa.id_solicitante;
          }
        }

        let created = false;
        let solicitante;

        if (targetId) {
          const updateData: any = {
            ...(byMs ? {} : { microsoftUserId: u.id }),
            nombre: cleanName,
            email: cleanEmail,
            empresaId,
            isActive: active,
            accountType: "microsoft",
            deactivatedAt: active ? null : new Date(),
          };

          if (active) {
            updateData.deletedAt = null;
          }

          solicitante = await tx.solicitante.update({
            where: { id_solicitante: targetId },
            data: updateData,
          });
        } else {
          try {
            solicitante = await tx.solicitante.create({
              data: {
                microsoftUserId: u.id,
                nombre: cleanName,
                email: cleanEmail,
                empresaId,
                isActive: active,
                accountType: "microsoft" as any,
                deletedAt: null,
                deactivatedAt: active ? null : new Date(),
              },
            });

            created = true;
          } catch (e: any) {
            if (e?.code === "P2002") {
              const already = await tx.solicitante.findUnique({
                where: { microsoftUserId: u.id },
                select: { id_solicitante: true },
              });

              if (!already) throw e;

              const updateData: any = {
                nombre: cleanName,
                email: cleanEmail,
                empresaId,
                isActive: active,
                accountType: "microsoft",
                deactivatedAt: active ? null : new Date(),
              };

              if (active) {
                updateData.deletedAt = null;
              }

              solicitante = await tx.solicitante.update({
                where: { id_solicitante: already.id_solicitante },
                data: updateData,
              });

              created = false;
            } else {
              throw e;
            }
          }
        }

        const solicitanteId = solicitante.id_solicitante;

        const current = await tx.solicitanteMsLicense.findMany({
          where: { solicitanteId },
          select: { skuId: true },
        });

        const currentSet = new Set(current.map((x) => x.skuId));
        const nextSet = new Set((u.licenses ?? []).map((x) => x.skuId));

        const toRemove = [...currentSet].filter((skuId) => !nextSet.has(skuId));

        if (toRemove.length) {
          await tx.solicitanteMsLicense.deleteMany({
            where: { solicitanteId, skuId: { in: toRemove } },
          });
        }

        const toAdd = (u.licenses ?? []).filter((l) => !currentSet.has(l.skuId));

        if (toAdd.length) {
          await tx.solicitanteMsLicense.createMany({
            data: toAdd.map((l) => ({
              solicitanteId,
              skuId: l.skuId,
            })),
            skipDuplicates: true,
          });
        }

        return { solicitante, created };
      },
      {
        maxWait: 20_000,
        timeout: 30_000,
        isolationLevel: "ReadCommitted",
      }
    );
  });
}

// Función para desactivar solicitantes vinculados a Microsoft que ya no están en el listado de usuarios de MS
export async function deactivateMissingMicrosoftSolicitantes(
  empresaId: number,
  microsoftIdsActivos: string[]
) {
  const ids = microsoftIdsActivos
    .map((x) => x?.trim())
    .filter(Boolean);

  if (!ids.length) {
    return { count: 0, users: [] };
  }

  const usersToDeactivate = await prisma.solicitante.findMany({
    where: {
      empresaId,
      accountType: "microsoft",
      microsoftUserId: { not: null },
      isActive: true,
      deletedAt: null,
      NOT: {
        microsoftUserId: { in: ids },
      },
    },
    select: {
      id_solicitante: true,
      nombre: true,
      email: true,
      microsoftUserId: true,
      empresaId: true,
    },
    orderBy: { nombre: "asc" },
  });

  if (usersToDeactivate.length === 0) {
    return { count: 0, users: [] };
  }

  const result = await prisma.solicitante.updateMany({
    where: {
      id_solicitante: {
        in: usersToDeactivate.map((u) => u.id_solicitante),
      },
    },
    data: {
      isActive: false,
      deactivatedAt: new Date(),
    } as any,
  });

  return {
    count: result.count,
    users: usersToDeactivate,
  };
}