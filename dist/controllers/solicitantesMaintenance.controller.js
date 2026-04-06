import { prisma } from "../lib/prisma.js";
/**
 * ✅ Empresas “box/clinica” donde ES NORMAL que existan solicitantes sin cuenta
 * (no se deben desactivar/purgar en el cleanup masivo)
 */
const EXCLUDED_EMPRESA_IDS = new Set([6, 7, 31, 22, 29]);
const toEmpresaId = (v) => {
    const n = Number(v);
    return Number.isFinite(n) && n > 0 ? n : null;
};
const normMode = (v) => {
    const s = String(v ?? "deactivate").trim().toLowerCase();
    return s === "purge" ? "purge" : "deactivate";
};
// ======================================================
/*  Cleanup de Solicitantes sin cuenta (accountType null + no google/msId)
*/
async function getOrCreateSystemSolicitanteId(tx, empresaId) {
    const sysClienteId = -empresaId;
    const sysEmail = `sistema+empresa-${empresaId}@rids.local`;
    const sys = await tx.solicitante.upsert({
        where: { clienteId: sysClienteId }, // unique
        create: {
            nombre: "Solicitante Sistema",
            email: sysEmail,
            empresaId,
            isActive: false,
            accountType: null,
            googleUserId: null,
            microsoftUserId: null,
            telefono: null,
            clienteId: sysClienteId,
        },
        update: {
            nombre: "Solicitante Sistema",
            email: sysEmail,
            isActive: false,
            empresaId,
            accountType: null,
            googleUserId: null,
            microsoftUserId: null,
        },
        select: { id_solicitante: true },
    });
    return sys.id_solicitante;
}
// Función principal de cleanup por empresa (con tx)
async function cleanupNoCuentaForEmpresa(tx, empresaId, mode) {
    // ✅ Excepción: clínicas/boxes -> no limpiar
    if (EXCLUDED_EMPRESA_IDS.has(empresaId)) {
        return { affected: 0, skipped: true };
    }
    const whereNoCuenta = {
        empresaId,
        accountType: null,
        googleUserId: null,
        microsoftUserId: null,
    };
    const candidates = await tx.solicitante.findMany({
        where: whereNoCuenta,
        select: { id_solicitante: true },
    });
    const ids = candidates.map((x) => x.id_solicitante);
    if (ids.length === 0)
        return { affected: 0 };
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
        data: { requesterId: null },
    })
        .catch(() => null);
    // freshdesk ticket (solicitanteId nullable)
    await tx.freshdeskTicket
        .updateMany({
        where: { solicitanteId: { in: ids } },
        data: { solicitanteId: null },
    })
        .catch(() => null);
    // firma (solicitanteId nullable)
    await tx.firma
        .updateMany({
        where: { solicitanteId: { in: ids } },
        data: { solicitanteId: null },
    })
        .catch(() => null);
    // servidorUsuario (solicitanteId nullable)
    await tx.servidorUsuario
        .updateMany({
        where: { solicitanteId: { in: ids } },
        data: { solicitanteId: null },
    })
        .catch(() => null);
    // mantenciones remotas (solicitanteId nullable)
    await tx.mantencionRemota
        .updateMany({
        where: { solicitanteId: { in: ids } },
        data: { solicitanteId: null },
    })
        .catch(() => null);
    // visitas (solicitanteId nullable)
    await tx.visita
        .updateMany({
        where: { solicitanteId: { in: ids } },
        data: { solicitanteId: null },
    })
        .catch(() => null);
    // equipos (idSolicitante nullable)
    await tx.equipo
        .updateMany({
        where: { idSolicitante: { in: ids } },
        data: { idSolicitante: null },
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
export async function cleanupSolicitantesNoCuenta(req, res, next) {
    try {
        const empresaId = toEmpresaId(req.body?.empresaId);
        const mode = normMode(req.body?.mode);
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
        const results = [];
        let totalAffected = 0;
        let totalSkipped = 0;
        // ✅ Importante: transacción por empresa (no una gigante)
        for (const empId of empresaIds) {
            const r = await prisma.$transaction(async (tx) => cleanupNoCuentaForEmpresa(tx, empId, mode), { maxWait: 60_000, timeout: 120_000 });
            results.push({ empresaId: empId, affected: r.affected, ...(r.skipped ? { skipped: true } : {}) });
            totalAffected += r.affected;
            if (r.skipped)
                totalSkipped += 1;
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
    }
    catch (e) {
        next(e);
    }
}
//# sourceMappingURL=solicitantesMaintenance.controller.js.map