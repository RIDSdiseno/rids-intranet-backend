import { Router } from "express";
import { listAllUsers } from "../google/googleDirectory.js";
import { upsertSolicitanteFromGoogle } from "../service/solicitanteSync.js";
import { prisma } from "../lib/prisma.js";
const router = Router();
/**
 * POST /sync/google/users
 * body: { domain: string, empresaId: number }
 * Nota: si varias empresas comparten el dominio, llama este endpoint por empresa
 * pasando el empresaId que corresponda a ese lote.
 */
router.post("/sync/google/users", async (req, res, _next) => {
    try {
        const { domain, empresaId } = req.body;
        const dom = (domain ?? "").trim();
        const empIdNum = Number(empresaId);
        if (!dom || !empIdNum || Number.isNaN(empIdNum)) {
            res.status(400).json({ ok: false, error: "domain y empresaId requeridos" });
            return;
        }
        // ✅ Usa listAllUsers(domain) — el domain ahora determina el admin correcto
        const users = await listAllUsers(dom);
        let created = 0, updated = 0, skipped = 0;
        for (const u of users) {
            if (!u.id || !u.primaryEmail) {
                skipped++;
                continue;
            }
            // Si tu esquema no tiene unique por googleUserId, deja el `as any`
            const before = await prisma.solicitante.findUnique({
                where: { googleUserId: u.id },
                select: { id_solicitante: true },
            }).catch(() => null);
            await upsertSolicitanteFromGoogle({
                id: u.id,
                primaryEmail: u.primaryEmail,
                name: u.name,
                suspended: u.suspended,
            }, empIdNum);
            if (before)
                updated++;
            else
                created++;
        }
        res.json({
            ok: true,
            domain: dom,
            empresaId: empIdNum,
            total: users.length,
            created,
            updated,
            skipped,
        });
        return;
    }
    catch (e) {
        console.error("[POST /sync/google/users] ERROR:", e?.response?.data || e);
        res.status(500).json({ ok: false, error: e?.message || "internal" });
        return;
    }
});
/**
 * PUT /sync/google/users
 * body: { domain: string, empresaId: number, email?: string }
 * - Sin `email`: re-sincroniza todo el dominio (idempotente).
 * - Con `email`: re-sincroniza solo ese usuario (si existe en Google).
 */
router.put("/sync/google/users", async (req, res, _next) => {
    try {
        const { domain, empresaId, email } = req.body;
        const dom = (domain ?? "").trim();
        const empIdNum = Number(empresaId);
        const emailNorm = (email ?? "").trim().toLowerCase();
        if (!dom || !empIdNum || Number.isNaN(empIdNum)) {
            res.status(400).json({ ok: false, error: "domain y empresaId requeridos" });
            return;
        }
        // ✅ listAllUsers ahora selecciona el admin según el dominio
        const users = await listAllUsers(dom);
        const target = email
            ? users.filter((u) => (u.primaryEmail || "").toLowerCase() === emailNorm)
            : users;
        if (email && target.length === 0) {
            res
                .status(404)
                .json({ ok: false, error: `No se encontró ${email} en Google (${dom})` });
            return;
        }
        let created = 0, updated = 0, skipped = 0;
        for (const u of target) {
            if (!u.id || !u.primaryEmail) {
                skipped++;
                continue;
            }
            const before = await prisma.solicitante.findUnique({
                where: { googleUserId: u.id },
                select: { id_solicitante: true },
            }).catch(() => null);
            await upsertSolicitanteFromGoogle({
                id: u.id,
                primaryEmail: u.primaryEmail,
                name: u.name,
                suspended: u.suspended,
            }, empIdNum);
            if (before)
                updated++;
            else
                created++;
        }
        res.json({
            ok: true,
            domain: dom,
            empresaId: empIdNum,
            filter: email ?? null,
            total: target.length,
            created,
            updated,
            skipped,
        });
        return;
    }
    catch (e) {
        console.error("[PUT /sync/google/users] ERROR:", e?.response?.data || e);
        res.status(500).json({ ok: false, error: e?.message || "internal" });
        return;
    }
});
export default router;
//# sourceMappingURL=syncGoogle.routes.js.map