// src/ms/graph.ts
import fetch from "node-fetch";
const DEFAULT_AUTH = {
    tenant: process.env.MS_TENANT_ID || "",
    clientId: process.env.MS_CLIENT_ID || "",
    clientSecret: process.env.MS_CLIENT_SECRET || "",
};
function parseAuthMap() {
    const raw = process.env.MS_AUTH_MAP || "";
    const out = {};
    for (const part of raw.split("|")) {
        const s = part.trim();
        if (!s)
            continue;
        const [domain, rest] = s.split(":").map(x => x.trim());
        if (!domain || !rest)
            continue;
        const [tenant, clientId, clientSecret] = rest.split(";").map(x => x.trim());
        if (tenant && clientId && clientSecret) {
            out[domain.toLowerCase()] = { tenant, clientId, clientSecret };
        }
    }
    return out;
}
const AUTH_BY_DOMAIN = parseAuthMap();
function getAuthForDomain(domain) {
    if (!domain)
        return DEFAULT_AUTH;
    return AUTH_BY_DOMAIN[domain.toLowerCase()] || DEFAULT_AUTH;
}
/* =================== Token cache (por perfil) =================== */
let cached = null;
async function getToken(auth) {
    const now = Math.floor(Date.now() / 1000);
    const cacheKey = `${auth.tenant}:${auth.clientId}`;
    if (cached && cached.key === cacheKey && cached.exp - 60 > now)
        return cached.token;
    const body = new URLSearchParams({
        client_id: auth.clientId,
        client_secret: auth.clientSecret,
        scope: "https://graph.microsoft.com/.default",
        grant_type: "client_credentials",
    });
    const url = `https://login.microsoftonline.com/${auth.tenant}/oauth2/v2.0/token`;
    const r = await fetch(url, {
        method: "POST",
        body,
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
    });
    if (!r.ok)
        throw new Error(`Token HTTP ${r.status}`);
    const j = (await r.json());
    cached = {
        token: j.access_token,
        exp: Math.floor(Date.now() / 1000) + j.expires_in,
        key: cacheKey,
    };
    return j.access_token;
}
/* =================== Helpers Graph (con perfil) =================== */
async function graphGET(path, auth) {
    const token = await getToken(auth);
    const url = path.startsWith("http") ? path : `https://graph.microsoft.com/v1.0${path}`;
    const r = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    if (!r.ok) {
        const t = await r.text().catch(() => "");
        throw new Error(`Graph GET ${path} -> ${r.status} ${t}`);
    }
    return (await r.json());
}
/* =================== Usuarios =================== */
async function fetchAllUsers(auth) {
    const select = "$select=id,displayName,mail,userPrincipalName,accountEnabled";
    let url = `/users?${select}&$top=999`;
    const out = [];
    while (url) {
        const page = await graphGET(url, auth);
        out.push(...page.value);
        const next = page["@odata.nextLink"];
        url = next ? next.replace("https://graph.microsoft.com/v1.0", "") : null;
    }
    return out;
}
/* =================== SKUs suscritos (catálogo) =================== */
const skuCache = {};
async function fetchSubscribedSkus(auth) {
    const key = `${auth.tenant}:${auth.clientId}`;
    const now = Date.now();
    const hit = skuCache[key];
    if (hit && now - hit.at < hit.ttlMs)
        return hit.data;
    const j = await graphGET("/subscribedSkus", auth);
    const m = {};
    for (const s of j.value) {
        const k = s.skuId.toLowerCase();
        const entry = {
            part: s.skuPartNumber || s.skuDisplayName || s.skuId,
        };
        if (s.skuDisplayName)
            entry.display = s.skuDisplayName;
        m[k] = entry;
    }
    skuCache[key] = { at: now, ttlMs: 10 * 60 * 1000, data: m };
    return m;
}
/* =================== Licencias por usuario (batch) =================== */
async function fetchLicenseDetailsBatch(auth, userIds) {
    if (userIds.length === 0)
        return {};
    const token = await getToken(auth);
    const url = "https://graph.microsoft.com/v1.0/$batch";
    const chunks = [];
    for (let i = 0; i < userIds.length; i += 20)
        chunks.push(userIds.slice(i, i + 20));
    const out = {};
    for (const group of chunks) {
        const idToUserId = {};
        const requests = group.map((userId, i) => {
            const reqId = String(i + 1);
            idToUserId[reqId] = userId;
            return {
                id: reqId,
                method: "GET",
                url: `/users/${userId}/licenseDetails?$select=skuId,skuPartNumber,servicePlans`,
            };
        });
        const body = { requests };
        const r = await fetch(url, {
            method: "POST",
            headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
            body: JSON.stringify(body),
        });
        if (!r.ok)
            throw new Error(`$batch HTTP ${r.status}`);
        const j = (await r.json());
        for (const resp of j.responses) {
            const userId = idToUserId[resp.id];
            if (!userId)
                continue;
            out[userId] = (resp.status === 200 && resp.body?.value) ? resp.body.value : [];
        }
    }
    return out;
}
async function listUsersForSingleDomain(domain) {
    const auth = getAuthForDomain(domain);
    const all = await fetchAllUsers(auth);
    const filtered = domain
        ? all.filter(u => {
            const d = `@${domain}`.toLowerCase().trim();
            const emailish = (u.mail ?? u.userPrincipalName ?? "").toLowerCase().trim();
            return emailish.endsWith(d);
        })
        : all;
    const licenseMap = await fetchLicenseDetailsBatch(auth, filtered.map(u => u.id));
    const skuMap = await fetchSubscribedSkus(auth);
    const toName = (u) => (u.displayName?.trim() || u.userPrincipalName || u.mail || "Usuario");
    const toEmail = (u) => (u.mail?.toLowerCase() || u.userPrincipalName?.toLowerCase() || null);
    return filtered.map(u => {
        const details = licenseMap[u.id] || [];
        const seen = new Set();
        const licenses = [];
        for (const d of details) {
            const rawSku = d.skuId;
            const lc = rawSku?.toLowerCase();
            if (!lc || seen.has(lc))
                continue;
            seen.add(lc);
            const mapHit = skuMap[lc];
            const skuPartNumber = d.skuPartNumber || mapHit?.part || rawSku;
            const displayName = mapHit?.display;
            licenses.push({
                skuId: rawSku,
                skuPartNumber,
                ...(displayName ? { displayName } : {}),
            });
        }
        return {
            id: u.id,
            name: toName(u),
            email: toEmail(u),
            suspended: u.accountEnabled === false,
            licenses,
        };
    });
}
export async function listUsersWithLicenses(opts) {
    const dom = opts?.filterDomain;
    if (!dom) {
        return listUsersForSingleDomain(undefined);
    }
    if (typeof dom === "string") {
        return listUsersForSingleDomain(dom);
    }
    const domains = dom.filter(Boolean);
    if (domains.length === 0)
        return [];
    const bags = await Promise.all(domains.map(d => listUsersForSingleDomain(d)));
    const map = new Map();
    for (const arr of bags) {
        for (const u of arr)
            map.set(u.id, u);
    }
    return [...map.values()];
}
//# sourceMappingURL=graph.js.map