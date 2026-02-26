// src/controllers/solicitantesMaintenance.controller.ts
import type { Request, Response, NextFunction } from "express";
import { prisma } from "../lib/prisma.js";

type CleanupMode = "deactivate" | "purge";

/**
 * ✅ Empresas “box/clinica” donde ES NORMAL que existan solicitantes sin cuenta
 * (no se deben desactivar/purgar en el cleanup masivo)
 */
const EXCLUDED_EMPRESA_IDS = new Set([6, 7, 31, 22, 29]);

/**
 * ✅ FIX TIPOS: tu prisma está extendido ($extends), por eso Prisma.TransactionClient no calza.
 * Tomamos el tipo real de "tx" desde TU instancia prisma.
 */
type TxClient = Parameters<Parameters<typeof prisma.$transaction>[0]>[0];

const toEmpresaId = (v: unknown) => {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : null;
};

const normMode = (v: unknown): CleanupMode => {
  const s = String(v ?? "deactivate").trim().toLowerCase();
  return s === "purge" ? "purge" : "deactivate";
};

async function getOrCreateSystemSolicitanteId(tx: TxClient, empresaId: number) {
  const sysClienteId = -empresaId;
  const sysEmail = `sistema+empresa-${empresaId}@rids.local`;

  const sys = await tx.solicitante.upsert({
    where: { clienteId: sysClienteId }, // unique
    create: {
      nombre: "Solicitante Sistema",
      email: sysEmail,
      empresaId,
      isActive: false,
      accountType: null as any,
      googleUserId: null as any,
      microsoftUserId: null as any,
      telefono: null as any,
      clienteId: sysClienteId,
    },
    update: {
      nombre: "Solicitante Sistema",
      email: sysEmail,
      isActive: false,
      empresaId,
      accountType: null as any,
      googleUserId: null as any,
      microsoftUserId: null as any,
    },
    select: { id_solicitante: true },
  });

  return sys.id_solicitante;
}

async function cleanupNoCuentaForEmpresa(
  tx: TxClient,
  empresaId: number,
  mode: CleanupMode
): Promise<{ affected: number; skipped?: boolean }> {
  // ✅ Excepción: clínicas/boxes -> no limpiar
  if (EXCLUDED_EMPRESA_IDS.has(empresaId)) {
    return { affected: 0, skipped: true };
  }

  const whereNoCuenta = {
    empresaId,
    accountType: null as any,
    googleUserId: null as any,
    microsoftUserId: null as any,
  };

  const candidates = await tx.solicitante.findMany({
    where: whereNoCuenta,
    select: { id_solicitante: true },
  });

  const ids = candidates.map((x) => x.id_solicitante);
  if (ids.length === 0) return { affected: 0 };

  if (mode === "deactivate") {
    const r = await tx.solicitante.updateMany({
      where: { id_solicitante: { in: ids } },
      data: { isActive: false },
    });
    return { affected: r.count };
  }

  // purge: limpiar FKs + borrar solicitantes
  const sysId = await getOrCreateSystemSolicitanteId(tx, empresaId);

  // (por si acaso) licencias MS asociadas
  await tx.solicitanteMsLicense
    .deleteMany({ where: { solicitanteId: { in: ids } } })
    .catch(() => null);

  // maps legacy freshdesk
  await tx.freshdeskRequesterMap
    .deleteMany({ where: { solicitanteId: { in: ids } } })
    .catch(() => null);

  // ticket nuevo (requesterId nullable)
  await tx.ticket
    .updateMany({
      where: { requesterId: { in: ids } },
      data: { requesterId: null as any },
    })
    .catch(() => null);

  // freshdesk ticket (solicitanteId nullable)
  await tx.freshdeskTicket
    .updateMany({
      where: { solicitanteId: { in: ids } },
      data: { solicitanteId: null as any },
    })
    .catch(() => null);

  // firma (solicitanteId nullable)
  await tx.firma
    .updateMany({
      where: { solicitanteId: { in: ids } },
      data: { solicitanteId: null as any },
    })
    .catch(() => null);

  // servidorUsuario (solicitanteId nullable)
  await tx.servidorUsuario
    .updateMany({
      where: { solicitanteId: { in: ids } },
      data: { solicitanteId: null as any },
    })
    .catch(() => null);

  // mantenciones remotas (solicitanteId nullable)
  await tx.mantencionRemota
    .updateMany({
      where: { solicitanteId: { in: ids } },
      data: { solicitanteId: null as any },
    })
    .catch(() => null);

  // visitas (solicitanteId nullable)
  await tx.visita
    .updateMany({
      where: { solicitanteId: { in: ids } },
      data: { solicitanteId: null as any },
    })
    .catch(() => null);

  // equipos (idSolicitante nullable)
  await tx.equipo
    .updateMany({
      where: { idSolicitante: { in: ids } },
      data: { idSolicitante: null as any },
    })
    .catch(() => null);

  // historial (solicitanteId NO nullable) => reasignar a sistema
  await tx.historial
    .updateMany({
      where: { solicitanteId: { in: ids } },
      data: { solicitanteId: sysId },
    })
    .catch(() => null);

  await tx.solicitante.deleteMany({
    where: { id_solicitante: { in: ids } },
  });

  return { affected: ids.length };
}

/**
 * POST /api/solicitantes/cleanup/no-cuenta
 * body: { empresaId?: number, mode?: "deactivate" | "purge" }
 *
 * - Si empresaId viene: limpia esa empresa (salvo excepciones)
 * - Si NO viene: limpia todas (iterando empresas, saltando excepciones)
 */
export async function cleanupSolicitantesNoCuenta(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const empresaId = toEmpresaId((req.body as any)?.empresaId);
    const mode = normMode((req.body as any)?.mode);

    const t0 = Date.now();

    // Si viene empresaId y es excepción, respondemos ok + skipped
    if (empresaId && EXCLUDED_EMPRESA_IDS.has(empresaId)) {
      res.json({
        ok: true,
        mode,
        scope: "empresa",
        empresaId,
        affected: 0,
        skipped: true,
        reason: "Empresa marcada como clínica/boxes (solicitantes sin cuenta son válidos).",
        ms: Date.now() - t0,
      });
      return;
    }

    // Si es "todas", sacamos ids de empresa desde Empresa
    const empresaIds = empresaId
      ? [empresaId]
      : (await prisma.empresa.findMany({ select: { id_empresa: true } })).map((e) => e.id_empresa);

    const results: Array<{ empresaId: number; affected: number; skipped?: boolean }> = [];
    let totalAffected = 0;
    let totalSkipped = 0;

    // ✅ Importante: transacción por empresa (no una gigante)
    for (const empId of empresaIds) {
      const r = await prisma.$transaction(
        async (tx) => cleanupNoCuentaForEmpresa(tx as TxClient, empId, mode),
        { maxWait: 60_000, timeout: 120_000 }
      );

      results.push({ empresaId: empId, affected: r.affected, ...(r.skipped ? { skipped: true } : {}) });
      totalAffected += r.affected;
      if (r.skipped) totalSkipped += 1;
    }

    res.json({
      ok: true,
      mode,
      scope: empresaId ? "empresa" : "all",
      empresaId: empresaId ?? null,
      affected: totalAffected,
      skippedEmpresas: totalSkipped,
      excludedEmpresaIds: Array.from(EXCLUDED_EMPRESA_IDS),
      perEmpresa: empresaId ? undefined : results,
      ms: Date.now() - t0,
    });
  } catch (e) {
    next(e);
  }
}