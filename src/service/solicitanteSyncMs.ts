// src/service/solicitanteSyncMs.ts
import { prisma } from "../lib/prisma.js";

export type MsUserInput = {
  id: string;
  email: string | null;
  name: string; // <- string
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
    retries = 3,
    baseDelayMs = 200,
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
        pgCode === "40P01";

      if (!transient || i === retries) break;

      const delay = baseDelayMs * Math.pow(2, i);
      await new Promise((r) => setTimeout(r, delay));
    }
  }
  throw lastErr;
}

/**
 * Upsert principal (¡sin upserts de SKUs dentro del tx!).
 * - Crea/actualiza catálogo de SKUs **fuera** de la transacción (createMany + skipDuplicates).
 * - Transacción solo para Solicitante + diff de licencias.
 * - Timeout e isolationLevel ajustados para reducir deadlocks.
 * - Retries ante deadlocks/tx cerrada.
 */
export async function upsertSolicitanteFromMicrosoft(u: MsUserInput, empresaId: number) {
  const cleanEmail = (u.email || "").trim().toLowerCase() || null;
  const cleanName = (u.name || "").trim() || "Usuario";
  const active = !u.suspended;

  // 0) Catálogo de SKUs (fuera de la transacción; idempotente)
  if (u.licenses?.length) {
    const uniqueSkus = Array.from(
      new Map(
        u.licenses.map((l) => [
          l.skuId,
          {
            skuId: l.skuId,
            skuPartNumber: l.skuPartNumber,
            displayName: l.displayName ?? l.skuPartNumber,
          },
        ])
      ).values()
    );

    if (uniqueSkus.length) {
      // Esto evita N upserts y evita locks dentro del tx
      await prisma.msSku.createMany({
        data: uniqueSkus,
        skipDuplicates: true,
      });
    }
  }

  // 1) Transacción con retries ante deadlocks
  return await retry(async () => {
    return prisma.$transaction(
      async (tx) => {
        // 2) Resolver target por prioridad:
        //    a) por microsoftUserId (evita conflicto)
        //    b) por email (preferimos misma empresa)
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
          } else {
            const byEmailAny = await tx.solicitante.findFirst({
              where: { email: cleanEmail },
              select: { id_solicitante: true },
            });
            if (byEmailAny) targetId = byEmailAny.id_solicitante;
          }
        }

        // 3) Crear / actualizar Solicitante (sin tocar msSku aquí)
        const solicitante = targetId
          ? await tx.solicitante.update({
              where: { id_solicitante: targetId },
              data: {
                ...(byMs ? {} : { microsoftUserId: u.id }),
                nombre: cleanName,
                email: cleanEmail,
                empresaId,
                isActive: active,
                accountType: "microsoft" as any,
              },
            })
          : await tx.solicitante.create({
              data: {
                microsoftUserId: u.id,
                nombre: cleanName,
                email: cleanEmail,
                empresaId,
                isActive: active,
                accountType: "microsoft" as any,
              },
            });

        // 4) Diff de licencias (solo tabla relacional)
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
            data: toAdd.map((l) => ({ solicitanteId, skuId: l.skuId })),
            skipDuplicates: true,
          });
        }

        return solicitante;
      },
      {
        // reduce el tiempo esperando un slot de tx
        maxWait: 8_000, // ms
        // tiempo total de la transacción antes de cerrar
        timeout: 10_000, // ms
        isolationLevel: "ReadCommitted",
      }
    );
  });
}
