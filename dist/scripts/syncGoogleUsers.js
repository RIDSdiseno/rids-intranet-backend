import "dotenv/config";
import { listAllUsers } from "../google/googleDirectory.js";
import { upsertSolicitanteFromGoogle_min } from "../service/solicitanteSync.js";
/* =========================================
   Configuración por ENV
   ========================================= */
const ONLY_ACTIVE = (process.env.SYNC_ONLY_ACTIVE ?? "false").toLowerCase() === "true";
const DRY_RUN = (process.env.SYNC_DRY_RUN ?? "false").toLowerCase() === "true";
const CONCURRENCY = Math.max(1, Number(process.env.SYNC_CONCURRENCY ?? 5));
/**
 * Permite override por ENV, ejemplo:
 *   SYNC_DOMAIN_MAP="alianz.cl:1,otraempresa.cl:2"
 */
function parseDomainMap() {
    const raw = process.env.SYNC_DOMAIN_MAP;
    if (!raw || !raw.trim()) {
        return {
            "alianz.cl": 1, // <-- reemplaza con id real
            // "otraempresa.cl": 2,
            // "nace.cl": 3,
        };
    }
    return raw.split(",").reduce((acc, pair) => {
        const [d, idStr] = pair.split(":").map((s) => s.trim());
        const id = Number(idStr);
        if (d && Number.isFinite(id))
            acc[d] = id;
        return acc;
    }, {});
}
const DOMAIN_TO_EMPRESA = parseDomainMap();
function nowISO() {
    return new Date().toISOString();
}
function isActive(u) {
    // Google Directory: u.suspended === true -> inactivo
    return !(u?.suspended ?? false);
}
function ensureGoogleUser(u) {
    if (!u || typeof u.id !== "string" || !u.primaryEmail) {
        throw new Error("Usuario de Google inválido: falta id o primaryEmail");
    }
    return u;
}
function chunk(arr, size) {
    if (size <= 0)
        return [arr];
    const out = [];
    for (let i = 0; i < arr.length; i += size)
        out.push(arr.slice(i, i + size));
    return out;
}
/* =========================================
   Core
   ========================================= */
async function syncDomain(domain, empresaId) {
    console.log(`[${nowISO()}][sync] dominio=${domain} → empresaId=${empresaId} (activeOnly=${ONLY_ACTIVE}, dryRun=${DRY_RUN}, conc=${CONCURRENCY})`);
    let users = [];
    try {
        users = (await listAllUsers(domain));
    }
    catch (e) {
        console.error(`[sync] ERROR listAllUsers(${domain})`, e?.response?.data || e?.message || e);
        throw e;
    }
    const counters = {
        recibidos: users.length,
        aProcesar: 0,
        ok: 0,
        creados: 0,
        actualizados: 0,
        omitidos: 0,
        fallidos: 0,
    };
    // Limpieza / filtro
    const clean = users.filter((u) => {
        if (!u?.primaryEmail)
            return false;
        if (!u?.id)
            return false;
        if (ONLY_ACTIVE && !isActive(u))
            return false;
        return true;
    });
    counters.aProcesar = clean.length;
    counters.omitidos = counters.recibidos - counters.aProcesar;
    if (clean.length === 0) {
        console.log(`[sync] ${domain}: no hay usuarios a procesar (recibidos=${counters.recibidos}, omitidos=${counters.omitidos}).`);
        return counters;
    }
    // Procesamiento en concurrencia controlada (sin dependencias externas)
    const batches = chunk(clean, CONCURRENCY);
    let batchIndex = 0;
    for (const batch of batches) {
        batchIndex++;
        const results = await Promise.allSettled(batch.map(async (raw) => {
            const user = ensureGoogleUser(raw);
            const email = user.primaryEmail;
            if (DRY_RUN) {
                // Simulamos resultado sin tocar BD
                return { email, flags: { skipped: true, dryRun: true } };
            }
            const res = await upsertSolicitanteFromGoogle_min(user, empresaId);
            return { email, flags: res };
        }));
        for (const r of results) {
            if (r.status === "fulfilled") {
                const { flags } = r.value;
                if (flags && typeof flags === "object") {
                    if (flags.created)
                        counters.creados++, counters.ok++;
                    else if (flags.updated)
                        counters.actualizados++, counters.ok++;
                    else if (flags.skipped) {
                        // skipped explícito: no sumamos ok
                    }
                    else {
                        counters.ok++; // sin flags: consideramos ok
                    }
                }
                else {
                    counters.ok++;
                }
            }
            else {
                counters.fallidos++;
                const reason = r.reason;
                const who = (reason && reason.user && reason.user.primaryEmail) ||
                    reason?.email ||
                    "(email no disponible)";
                const msg = reason?.response?.status || reason?.code || reason?.message || String(reason);
                console.warn(`[sync] FAIL ${who} → ${msg}`);
            }
        }
        // Telemetría por lote
        console.log(`[sync] ${domain}: batch ${batchIndex}/${batches.length} → ok=${counters.ok}, creados=${counters.creados}, actualizados=${counters.actualizados}, fallidos=${counters.fallidos}`);
    }
    console.log(`[sync] ${domain}: recibidos=${counters.recibidos} ` +
        `a_procesar=${counters.aProcesar} ok=${counters.ok} ` +
        `creados=${counters.creados} actualizados=${counters.actualizados} ` +
        `omitidos=${counters.omitidos} fallidos=${counters.fallidos}`);
    return counters;
}
async function main() {
    const pairs = Object.entries(DOMAIN_TO_EMPRESA);
    if (pairs.length === 0) {
        console.error('[sync] ERROR: No hay dominios configurados. Usa SYNC_DOMAIN_MAP="dominio1:empresaId1,..."');
        process.exit(2);
    }
    const startedAt = Date.now();
    let anyFailures = false;
    const perDomain = {};
    for (const [domain, empresaId] of pairs) {
        try {
            perDomain[domain] = await syncDomain(domain, empresaId);
        }
        catch {
            anyFailures = true;
            perDomain[domain] = {
                recibidos: 0,
                aProcesar: 0,
                ok: 0,
                creados: 0,
                actualizados: 0,
                omitidos: 0,
                fallidos: 0,
            };
            console.error(`[sync] Dominio ${domain} terminó con ERROR.`);
        }
    }
    // Resumen global
    const summary = Object.values(perDomain).reduce((acc, c) => {
        acc.recibidos += c.recibidos;
        acc.aProcesar += c.aProcesar;
        acc.ok += c.ok;
        acc.creados += c.creados;
        acc.actualizados += c.actualizados;
        acc.omitidos += c.omitidos;
        acc.fallidos += c.fallidos;
        return acc;
    }, { recibidos: 0, aProcesar: 0, ok: 0, creados: 0, actualizados: 0, omitidos: 0, fallidos: 0 });
    const finishedAt = Date.now();
    const payload = {
        startedAt: new Date(startedAt).toISOString(),
        finishedAt: new Date(finishedAt).toISOString(),
        durationMs: finishedAt - startedAt,
        onlyActive: ONLY_ACTIVE,
        dryRun: DRY_RUN,
        concurrency: CONCURRENCY,
        perDomain,
        summary,
    };
    if (anyFailures) {
        console.error("[sync] Terminado con errores:", JSON.stringify(payload));
        process.exit(2);
    }
    else {
        console.log("[sync] OK:", JSON.stringify(payload));
        process.exit(0);
    }
}
main().catch((e) => {
    console.error("[sync] ERROR no controlado:", e?.response?.data || e?.message || e);
    process.exit(1);
});
//# sourceMappingURL=syncGoogleUsers.js.map