import { prisma } from "../lib/prisma.js";
/* Utils */
const toInt = (v, def = 0) => {
    const n = Number(v);
    return Number.isFinite(n) && Number.isInteger(n) ? n : def;
};
const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));
const normalizeEmail = (v) => {
    const s = String(v ?? "").trim().toLowerCase();
    return s.length > 0 ? s : null;
};
const isValidEmail = (email) => {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
};
const normalizeRut = (v) => {
    const s = String(v ?? "")
        .trim()
        .replace(/\./g, "")
        .replace(/\s/g, "")
        .toUpperCase();
    if (!s)
        return null;
    const clean = s.replace(/-/g, "");
    if (!/^\d{7,8}[0-9K]$/.test(clean)) {
        return s;
    }
    return `${clean.slice(0, -1)}-${clean.slice(-1)}`;
};
const isValidRut = (rut) => {
    const clean = rut.replace(/\./g, "").replace(/-/g, "").toUpperCase();
    if (!/^\d{7,8}[0-9K]$/.test(clean))
        return false;
    const cuerpo = clean.slice(0, -1);
    const dv = clean.slice(-1);
    let suma = 0;
    let multiplo = 2;
    for (let i = cuerpo.length - 1; i >= 0; i--) {
        suma += Number(cuerpo[i]) * multiplo;
        multiplo = multiplo < 7 ? multiplo + 1 : 2;
    }
    const dvEsperadoNum = 11 - (suma % 11);
    const dvEsperado = dvEsperadoNum === 11 ? "0" : dvEsperadoNum === 10 ? "K" : String(dvEsperadoNum);
    return dv === dvEsperado;
};
/** ✅ Empresas donde los solicitantes pueden ser "boxes" sin cuenta */
const BOX_CLINIC_EMPRESA_IDS = new Set([6, 7, 22, 29, 31]); // Clínica Alameda, Providencia
const parseOrderBy = (v) => {
    const s = String(v ?? "").toLowerCase();
    if (s === "nombre")
        return "nombre";
    if (s === "id" || s === "ids" || s === "id_solicitante")
        return "id";
    return "empresa";
};
const parseOrderDir = (v) => {
    const s = String(v ?? "").toLowerCase();
    return s === "desc" ? "desc" : "asc";
};
/** Por defecto: mostrar SOLO solicitantes con cuenta (google/microsoft) */
const parseOnlyWithAccount = (v) => {
    const s = String(v ?? "").trim().toLowerCase();
    // default = true (si no viene)
    if (s === "" || s === "1" || s === "true" || s === "yes")
        return true;
    if (s === "0" || s === "false" || s === "no")
        return false;
    return true;
};
/** ✅ Override: en clínicas (6/7) SIEMPRE mostrar "sin cuenta" cuando se filtra por esa empresa */
const applyClinicOverrideOnlyWithAccount = (empresaId, onlyWithAccount) => {
    if (empresaId > 0 && BOX_CLINIC_EMPRESA_IDS.has(empresaId))
        return false;
    return onlyWithAccount;
};
/** Construye el orderBy compatible con Prisma para las 3 variantes */
const buildSolicitanteOrderBy = (orderByKey, orderDir) => {
    if (orderByKey === "nombre") {
        return [{ nombre: orderDir }, { id_solicitante: "asc" }];
    }
    if (orderByKey === "id") {
        return [{ id_solicitante: orderDir }];
    }
    // empresa
    const secondaryForNulls = orderDir === "asc" ? "desc" : "asc";
    return [
        { empresa: { nombre: orderDir } },
        { empresaId: secondaryForNulls },
        { nombre: "asc" },
        { id_solicitante: "asc" },
    ];
};
/** Filtro base: “tiene cuenta” */
const buildWhereOnlyWithAccount = () => ({
    OR: [
        { accountType: { in: ["google", "microsoft"] } },
        { googleUserId: { not: null } },
        { microsoftUserId: { not: null } },
    ],
});
const buildSolicitanteSearchWhere = (rawSearch, includeEmpresa = true) => {
    const search = String(rawSearch ?? "").trim();
    if (!search)
        return {};
    const INS = "insensitive";
    const terms = search
        .split(/\s+/)
        .map((x) => x.trim())
        .filter(Boolean);
    if (terms.length === 0)
        return {};
    return {
        AND: terms.map((term) => ({
            OR: [
                { nombre: { contains: term, mode: INS } },
                { rut: { contains: term.replace(/\./g, "").replace(/\s/g, ""), mode: INS } },
                { email: { contains: term, mode: INS } },
                { telefono: { contains: term, mode: INS } },
                ...(includeEmpresa
                    ? [{ empresa: { nombre: { contains: term, mode: INS } } }]
                    : []),
            ],
        })),
    };
};
/* ============================================================
 * GET /solicitantes
 * ============================================================ */
export const listSolicitantes = async (req, res) => {
    try {
        const q = String(req.query.q ?? req.query.search ?? "").trim();
        const empresaId = toInt(req.query.empresaId);
        const page = clamp(toInt(req.query.page, 1), 1, 1_000_000);
        const pageSize = clamp(toInt(req.query.pageSize, 10), 1, 100);
        const onlyGMS = String(req.query.onlyGMS ?? "").toLowerCase() === "1" ||
            String(req.query.onlyGMS ?? "").toLowerCase() === "true";
        // default true
        const user = req.user;
        // 👇 Si viene explícitamente en query → usarlo
        // 👇 Si NO viene → default depende del rol
        const onlyWithAccountRaw = req.query.onlyWithAccount !== undefined
            ? parseOnlyWithAccount(req.query.onlyWithAccount)
            : user?.rol === "CLIENTE"; // true para cliente, false para admin
        const onlyWithAccount = applyClinicOverrideOnlyWithAccount(empresaId, onlyWithAccountRaw);
        const includeMsDetails = String(req.query.includeMsDetails ?? "").toLowerCase() === "1" ||
            String(req.query.includeMsDetails ?? "").toLowerCase() === "true";
        const skip = (page - 1) * pageSize;
        const orderByKey = parseOrderBy(req.query.orderBy);
        const orderDir = parseOrderDir(req.query.orderDir);
        const where = {
            isActive: true,
            ...(user?.rol === "CLIENTE"
                ? { empresaId: Number(user.empresaId) }
                : empresaId > 0
                    ? { empresaId }
                    : {}),
            ...buildSolicitanteSearchWhere(q, true),
            ...(onlyGMS ? { accountType: { in: ["google", "microsoft"] } } : {}),
            ...(onlyWithAccount ? buildWhereOnlyWithAccount() : {}),
        };
        const orderBy = buildSolicitanteOrderBy(orderByKey, orderDir);
        const [total, baseSolicitantes] = await Promise.all([
            prisma.solicitante.count({ where }),
            prisma.solicitante.findMany({
                where,
                skip,
                take: pageSize,
                orderBy,
                select: {
                    id_solicitante: true,
                    nombre: true,
                    rut: true,
                    email: true,
                    telefono: true,
                    empresaId: true,
                    accountType: true,
                    googleUserId: true,
                    microsoftUserId: true,
                },
            }),
        ]);
        // Enriquecer con empresa, equipos y licencias MS
        const empresaIdSet = new Set(baseSolicitantes.map((s) => s.empresaId).filter((x) => typeof x === "number"));
        const solicitanteIdSet = new Set(baseSolicitantes.map((s) => s.id_solicitante));
        const [empresas, equipos, msLinks] = await Promise.all([
            prisma.empresa.findMany({
                where: { id_empresa: { in: Array.from(empresaIdSet) } },
                select: { id_empresa: true, nombre: true },
            }),
            prisma.equipo.findMany({
                where: { idSolicitante: { in: Array.from(solicitanteIdSet) } },
                select: {
                    id_equipo: true,
                    idSolicitante: true,
                    serial: true,
                    marca: true,
                    modelo: true,
                    procesador: true,
                    ram: true,
                    disco: true,
                    propiedad: true,
                },
                orderBy: { id_equipo: "asc" },
            }),
            prisma.solicitanteMsLicense.findMany({
                where: { solicitanteId: { in: Array.from(solicitanteIdSet) } },
                select: {
                    solicitanteId: true,
                    skuId: true,
                    sku: { select: { skuId: true, skuPartNumber: true, displayName: true } },
                },
                orderBy: { skuId: "asc" },
            }),
        ]);
        const empresaMap = new Map(empresas.map((e) => [e.id_empresa, e]));
        const equiposBySolic = new Map();
        for (const eq of equipos) {
            if (eq.idSolicitante == null)
                continue;
            const list = equiposBySolic.get(eq.idSolicitante) ?? [];
            list.push(eq);
            equiposBySolic.set(eq.idSolicitante, list);
        }
        const msBySolic = new Map();
        for (const l of msLinks) {
            const list = msBySolic.get(l.solicitanteId) ?? [];
            const lic = {
                skuId: l.skuId,
                skuPartNumber: l.sku?.skuPartNumber ?? l.skuId,
                ...(l.sku?.displayName ? { displayName: l.sku.displayName } : {}),
            };
            list.push(lic);
            msBySolic.set(l.solicitanteId, list);
        }
        const items = baseSolicitantes.map((s) => {
            const fullLic = msBySolic.get(s.id_solicitante) ?? [];
            return {
                ...s,
                empresa: s.empresaId ? empresaMap.get(s.empresaId) ?? null : null,
                equipos: equiposBySolic.get(s.id_solicitante) ?? [],
                msLicensesCount: fullLic.length,
                ...(includeMsDetails ? { msLicenses: fullLic } : {}),
            };
        });
        return res.json({
            page,
            pageSize,
            total,
            totalPages: Math.max(1, Math.ceil(total / pageSize)),
            filters: {
                empresaId: user?.rol === "CLIENTE" ? Number(user.empresaId) : empresaId || null,
                q: q ?? null,
                onlyGMS,
                // ✅ devolvemos el valor final aplicado (con override)
                onlyWithAccount,
                includeMsDetails,
            },
            items,
        });
    }
    catch (err) {
        console.error("[solicitantes.list] error:", err);
        return res.status(500).json({ error: "No se pudieron listar los solicitantes" });
    }
};
/* ============================================================
 * GET /solicitantes/by-empresa
 * ============================================================ */
export const listSolicitantesByEmpresa = async (req, res) => {
    try {
        const empresaId = toInt(req.query.empresaId);
        const q = String(req.query.q ?? req.query.search ?? "").trim();
        const user = req.user;
        const onlyWithAccountRaw = req.query.onlyWithAccount !== undefined
            ? parseOnlyWithAccount(req.query.onlyWithAccount)
            : user?.rol === "CLIENTE";
        const onlyWithAccount = applyClinicOverrideOnlyWithAccount(empresaId, onlyWithAccountRaw);
        if (user?.rol === "CLIENTE" && empresaId !== user.empresaId) {
            return res.status(403).json({ error: "No autorizado" });
        }
        if (empresaId <= 0) {
            return res.status(400).json({ error: "empresaId requerido y debe ser entero > 0" });
        }
        const orderByKey = parseOrderBy(req.query.orderBy);
        const orderDir = parseOrderDir(req.query.orderDir);
        const where = {
            isActive: true,
            empresaId,
            ...buildSolicitanteSearchWhere(q, false),
            ...(onlyWithAccount ? buildWhereOnlyWithAccount() : {}),
        };
        const rows = await prisma.solicitante.findMany({
            where,
            orderBy: buildSolicitanteOrderBy(orderByKey, orderDir),
            select: {
                id_solicitante: true,
                nombre: true,
                rut: true,
                email: true,
                telefono: true,
            },
        });
        return res.json({
            items: rows.map((s) => ({
                id: s.id_solicitante,
                nombre: s.nombre,
                rut: s.rut ?? null,
                email: s.email ?? null,
                telefono: s.telefono ?? null,
            })),
        });
    }
    catch (err) {
        console.error("[solicitantes.byEmpresa] error:", err);
        return res.status(500).json({ error: "No se pudieron obtener solicitantes por empresa" });
    }
};
/* ============================================================
 * GET /solicitantes/select
 * ============================================================ */
export const listSolicitantesForSelect = async (req, res) => {
    try {
        const orderByKey = parseOrderBy(req.query.orderBy);
        const orderDir = parseOrderDir(req.query.orderDir);
        const empresaId = toInt(req.query.empresaId);
        const user = req.user;
        const onlyWithAccountRaw = req.query.onlyWithAccount !== undefined
            ? parseOnlyWithAccount(req.query.onlyWithAccount)
            : user?.rol === "CLIENTE";
        const onlyWithAccount = applyClinicOverrideOnlyWithAccount(empresaId, onlyWithAccountRaw);
        const userEmpresaId = user?.rol === "CLIENTE" && user?.empresaId ? Number(user.empresaId) : null;
        const includeEmpresa = String(req.query.includeEmpresa ?? "").toLowerCase() === "true";
        const q = String(req.query.q ?? req.query.search ?? "").trim();
        const limit = clamp(toInt(req.query.limit, 100), 1, 500);
        const effectiveEmpresaId = userEmpresaId ?? (empresaId > 0 ? empresaId : null);
        const where = {
            isActive: true,
            ...(effectiveEmpresaId ? { empresaId: effectiveEmpresaId } : {}),
            ...buildSolicitanteSearchWhere(q, true),
            ...(onlyWithAccount ? buildWhereOnlyWithAccount() : {}),
        };
        const rows = await prisma.solicitante.findMany({
            where,
            take: limit,
            orderBy: buildSolicitanteOrderBy(orderByKey, orderDir),
            select: {
                id_solicitante: true,
                nombre: true,
                empresa: { select: { nombre: true } },
            },
        });
        const items = rows.map((r) => {
            const empresaNombre = r.empresa?.nombre ?? null;
            const text = includeEmpresa && empresaNombre ? `${r.nombre} — ${empresaNombre}` : r.nombre;
            return {
                value: r.id_solicitante,
                text,
                id: r.id_solicitante,
                nombre: r.nombre,
                empresaNombre,
            };
        });
        return res.json({ items });
    }
    catch (err) {
        console.error("[solicitantes.select] error:", err);
        return res.status(500).json({ error: "No se pudo obtener el listado para select" });
    }
};
/* ============================================================
 * GET /solicitantes/metrics
 * ============================================================ */
export const solicitantesMetrics = async (req, res) => {
    try {
        const q = String(req.query.q ?? req.query.search ?? "").trim();
        const empresaId = toInt(req.query.empresaId);
        const user = req.user;
        const onlyWithAccountRaw = req.query.onlyWithAccount !== undefined
            ? parseOnlyWithAccount(req.query.onlyWithAccount)
            : user?.rol === "CLIENTE";
        const onlyWithAccount = applyClinicOverrideOnlyWithAccount(empresaId, onlyWithAccountRaw);
        const userEmpresaId = user?.rol === "CLIENTE" && user?.empresaId ? Number(user.empresaId) : null;
        const where = {
            isActive: true,
            ...(userEmpresaId ? { empresaId: userEmpresaId } : empresaId > 0 ? { empresaId } : {}),
            ...buildSolicitanteSearchWhere(q, true),
            ...(onlyWithAccount ? buildWhereOnlyWithAccount() : {}),
        };
        const solicitantes = await prisma.solicitante.count({ where });
        const distinctEmpresas = await prisma.solicitante.findMany({
            where,
            select: { empresaId: true },
            distinct: ["empresaId"],
        });
        const empresas = distinctEmpresas.filter((e) => typeof e.empresaId === "number").length;
        const ids = await prisma.solicitante.findMany({
            where,
            select: { id_solicitante: true },
        });
        const idList = ids.map((s) => s.id_solicitante);
        const equipos = idList.length === 0
            ? 0
            : await prisma.equipo.count({
                where: { idSolicitante: { in: idList } },
            });
        return res.json({
            solicitantes,
            empresas,
            equipos,
            filters: {
                empresaId: userEmpresaId ?? (empresaId > 0 ? empresaId : null),
                q: q ?? null,
                onlyWithAccount,
            },
        });
    }
    catch (err) {
        console.error("[solicitantes.metrics] error:", err);
        return res.status(500).json({ error: "No se pudieron calcular las métricas" });
    }
};
/* ============================================================
 * GET /solicitantes/check-email
 * Valida si ya existe un solicitante activo con ese correo
 * ============================================================ */
export const checkSolicitanteEmail = async (req, res) => {
    try {
        const email = normalizeEmail(req.query.email);
        const excludeId = req.query.excludeId ? toInt(req.query.excludeId) : null;
        if (!email) {
            return res.json({
                exists: false,
                solicitante: null,
                message: null,
            });
        }
        if (!isValidEmail(email)) {
            return res.status(400).json({
                error: "El correo no tiene un formato válido",
            });
        }
        const existing = await prisma.solicitante.findFirst({
            where: {
                isActive: true,
                email: {
                    equals: email,
                    mode: "insensitive",
                },
                ...(excludeId && excludeId > 0
                    ? {
                        NOT: {
                            id_solicitante: excludeId,
                        },
                    }
                    : {}),
            },
            select: {
                id_solicitante: true,
                nombre: true,
                email: true,
                empresaId: true,
                empresa: {
                    select: {
                        id_empresa: true,
                        nombre: true,
                    },
                },
            },
        });
        return res.json({
            exists: !!existing,
            solicitante: existing,
            message: existing
                ? `Ya existe un solicitante con el correo ${email}. Pertenece a: ${existing.nombre}${existing.empresa?.nombre ? ` (${existing.empresa.nombre})` : ""}.`
                : null,
        });
    }
    catch (err) {
        console.error("[solicitantes.checkEmail] error:", err);
        return res.status(500).json({
            error: "No se pudo validar el correo",
        });
    }
};
/* ===================== CREATE ===================== */
export const createSolicitante = async (req, res) => {
    try {
        const nombre = String(req.body?.nombre ?? "").trim();
        const rut = normalizeRut(req.body?.rut);
        const email = normalizeEmail(req.body?.email);
        const telefonoRaw = (req.body?.telefono ?? null);
        const telefono = telefonoRaw ? String(telefonoRaw).trim() : null;
        const empresaId = toInt(req.body?.empresaId);
        if (!nombre) {
            return res.status(400).json({ error: "El nombre es obligatorio" });
        }
        if (rut && !isValidRut(rut)) {
            return res.status(400).json({ error: "El RUT no tiene un formato válido" });
        }
        if (rut) {
            const existingRut = await prisma.solicitante.findFirst({
                where: {
                    isActive: true,
                    rut: {
                        equals: rut,
                        mode: "insensitive",
                    },
                },
                select: {
                    id_solicitante: true,
                    nombre: true,
                    rut: true,
                    empresa: {
                        select: {
                            id_empresa: true,
                            nombre: true,
                        },
                    },
                },
            });
            if (existingRut) {
                return res.status(409).json({
                    error: `Ya existe un solicitante con el RUT ${rut}. Pertenece a: ${existingRut.nombre}${existingRut.empresa?.nombre ? ` (${existingRut.empresa.nombre})` : ""}.`,
                    duplicate: existingRut,
                });
            }
        }
        if (empresaId <= 0) {
            return res.status(400).json({ error: "empresaId inválido" });
        }
        if (email && !isValidEmail(email)) {
            return res.status(400).json({ error: "El correo no tiene un formato válido" });
        }
        const empresa = await prisma.empresa.findUnique({
            where: { id_empresa: empresaId },
            select: { id_empresa: true },
        });
        if (!empresa) {
            return res.status(404).json({ error: "La empresa no existe" });
        }
        if (email) {
            const existing = await prisma.solicitante.findFirst({
                where: {
                    isActive: true,
                    email: {
                        equals: email,
                        mode: "insensitive",
                    },
                },
                select: {
                    id_solicitante: true,
                    nombre: true,
                    email: true,
                    empresa: {
                        select: {
                            id_empresa: true,
                            nombre: true,
                        },
                    },
                },
            });
            if (existing) {
                return res.status(409).json({
                    error: `Ya existe un solicitante con el correo ${email}. Pertenece a: ${existing.nombre}${existing.empresa?.nombre ? ` (${existing.empresa.nombre})` : ""}.`,
                    duplicate: existing,
                });
            }
        }
        const created = await prisma.solicitante.create({
            data: {
                nombre,
                rut,
                email,
                telefono,
                empresaId,
            },
            select: {
                id_solicitante: true,
                nombre: true,
                rut: true,
                email: true,
                telefono: true,
                empresaId: true,
                accountType: true,
                empresa: { select: { id_empresa: true, nombre: true } },
            },
        });
        return res.status(201).json(created);
    }
    catch (err) {
        const e = err;
        if (e?.code === "P2002") {
            const meta = err?.meta;
            const target = Array.isArray(meta?.target) ? meta.target.join(",") : "";
            return res.status(409).json({
                error: target.includes("rut")
                    ? "Ya existe un solicitante con ese RUT"
                    : "Ya existe un solicitante con ese correo electrónico",
            });
        }
        console.error("[solicitantes.create] error:", err);
        return res.status(500).json({ error: "No se pudo crear el solicitante" });
    }
};
/* ===================== READ (uno) ===================== */
export const getSolicitanteById = async (req, res) => {
    try {
        const id = toInt(req.params.id);
        if (id <= 0)
            return res.status(400).json({ error: "ID inválido" });
        const solicitante = await prisma.solicitante.findUnique({
            where: { id_solicitante: id },
            select: {
                id_solicitante: true,
                nombre: true,
                rut: true,
                email: true,
                telefono: true,
                empresaId: true,
                accountType: true,
                empresa: { select: { id_empresa: true, nombre: true } },
                equipos: {
                    select: {
                        id_equipo: true,
                        serial: true,
                        marca: true,
                        modelo: true,
                        procesador: true,
                        ram: true,
                        disco: true,
                        propiedad: true,
                    },
                    orderBy: { id_equipo: "asc" },
                },
            },
        });
        if (!solicitante)
            return res.status(404).json({ error: "No encontrado" });
        const user = req.user;
        if (user?.rol === "CLIENTE" && solicitante.empresaId !== user.empresaId) {
            return res.status(403).json({ error: "No autorizado" });
        }
        const links = await prisma.solicitanteMsLicense.findMany({
            where: { solicitanteId: solicitante.id_solicitante },
            include: { sku: { select: { skuId: true, skuPartNumber: true, displayName: true } } },
            orderBy: { skuId: "asc" },
        });
        const msLicenses = links.map((l) => ({
            skuId: l.skuId,
            skuPartNumber: l.sku?.skuPartNumber ?? l.skuId,
            ...(l.sku?.displayName ? { displayName: l.sku.displayName } : {}),
        }));
        return res.json({ ...solicitante, msLicenses });
    }
    catch (err) {
        console.error("[solicitantes.getOne] error:", err);
        return res.status(500).json({ error: "No se pudo obtener el solicitante" });
    }
};
/* ===================== UPDATE ===================== */
export const updateSolicitante = async (req, res) => {
    try {
        const id = toInt(req.params.id);
        if (id <= 0)
            return res.status(400).json({ error: "ID inválido" });
        const nombre = typeof req.body?.nombre === "string" ? req.body.nombre.trim() : undefined;
        const rut = req.body?.rut === null
            ? null
            : typeof req.body?.rut === "string"
                ? normalizeRut(req.body.rut)
                : undefined;
        if (rut && !isValidRut(rut)) {
            return res.status(400).json({ error: "El RUT no tiene un formato válido" });
        }
        if (rut) {
            const existingRut = await prisma.solicitante.findFirst({
                where: {
                    isActive: true,
                    rut: {
                        equals: rut,
                        mode: "insensitive",
                    },
                    NOT: {
                        id_solicitante: id,
                    },
                },
                select: {
                    id_solicitante: true,
                    nombre: true,
                    rut: true,
                    empresa: {
                        select: {
                            id_empresa: true,
                            nombre: true,
                        },
                    },
                },
            });
            if (existingRut) {
                return res.status(409).json({
                    error: `Ya existe otro solicitante con el RUT ${rut}. Pertenece a: ${existingRut.nombre}${existingRut.empresa?.nombre ? ` (${existingRut.empresa.nombre})` : ""}.`,
                    duplicate: existingRut,
                });
            }
        }
        const email = req.body?.email === null
            ? null
            : typeof req.body?.email === "string"
                ? normalizeEmail(req.body.email)
                : undefined;
        const telefono = req.body?.telefono === null
            ? null
            : typeof req.body?.telefono === "string"
                ? req.body.telefono.trim()
                : undefined;
        const empresaId = typeof req.body?.empresaId !== "undefined" ? toInt(req.body.empresaId) : undefined;
        if (empresaId !== undefined && empresaId <= 0) {
            return res.status(400).json({ error: "empresaId inválido" });
        }
        const current = await prisma.solicitante.findUnique({
            where: { id_solicitante: id },
            select: { id_solicitante: true },
        });
        if (!current)
            return res.status(404).json({ error: "No encontrado" });
        if (email && !isValidEmail(email)) {
            return res.status(400).json({ error: "El correo no tiene un formato válido" });
        }
        if (email) {
            const existing = await prisma.solicitante.findFirst({
                where: {
                    isActive: true,
                    email: {
                        equals: email,
                        mode: "insensitive",
                    },
                    NOT: {
                        id_solicitante: id,
                    },
                },
                select: {
                    id_solicitante: true,
                    nombre: true,
                    email: true,
                    empresa: {
                        select: {
                            id_empresa: true,
                            nombre: true,
                        },
                    },
                },
            });
            if (existing) {
                return res.status(409).json({
                    error: `Ya existe otro solicitante con el correo ${email}. Pertenece a: ${existing.nombre}${existing.empresa?.nombre ? ` (${existing.empresa.nombre})` : ""}.`,
                    duplicate: existing,
                });
            }
        }
        if (typeof empresaId === "number") {
            const emp = await prisma.empresa.findUnique({
                where: { id_empresa: empresaId },
                select: { id_empresa: true },
            });
            if (!emp)
                return res.status(404).json({ error: "La empresa no existe" });
        }
        const updated = await prisma.solicitante.update({
            where: { id_solicitante: id },
            data: {
                ...(nombre !== undefined ? { nombre } : {}),
                ...(rut !== undefined ? { rut } : {}),
                ...(email !== undefined ? { email } : {}),
                ...(telefono !== undefined ? { telefono } : {}),
                ...(empresaId !== undefined ? { empresaId } : {}),
            },
            select: {
                id_solicitante: true,
                nombre: true,
                rut: true,
                email: true,
                telefono: true,
                empresaId: true,
                accountType: true,
                empresa: { select: { id_empresa: true, nombre: true } },
            },
        });
        return res.json(updated);
    }
    catch (err) {
        const e = err;
        if (e?.code === "P2002") {
            return res.status(409).json({
                error: "Ya existe otro solicitante con ese correo electrónico",
            });
        }
        console.error("[solicitantes.update] error:", err);
        return res.status(500).json({ error: "No se pudo actualizar el solicitante" });
    }
};
/* ===================== DELETE ===================== */
export const deleteSolicitante = async (req, res) => {
    try {
        const id = toInt(req.params.id);
        if (id <= 0)
            return res.status(400).json({ error: "ID inválido" });
        const transferToId = req.query.transferToId ? toInt(req.query.transferToId) : undefined;
        if (transferToId !== undefined) {
            if (transferToId <= 0) {
                return res.status(400).json({ error: "transferToId debe ser entero > 0" });
            }
            if (transferToId === id) {
                return res.status(400).json({ error: "transferToId no puede ser el mismo solicitante" });
            }
        }
        const fallbackParam = String(req.query.fallback ?? "null").toLowerCase();
        const fallback = fallbackParam === "sa" ? "sa" : "null";
        const source = await prisma.solicitante.findUnique({
            where: { id_solicitante: id },
            select: { id_solicitante: true, empresaId: true },
        });
        if (!source)
            return res.status(404).json({ error: "Solicitante no encontrado" });
        if (transferToId) {
            const dest = await prisma.solicitante.findUnique({
                where: { id_solicitante: transferToId },
                select: { id_solicitante: true },
            });
            if (!dest)
                return res.status(404).json({ error: "Solicitante destino no existe" });
        }
        const ensureSaSolicitante = async (empresaId) => {
            const existing = await prisma.solicitante.findFirst({
                where: { empresaId, nombre: "S/A" },
                select: { id_solicitante: true },
            });
            if (existing)
                return existing.id_solicitante;
            const created = await prisma.solicitante.create({
                data: {
                    nombre: "S/A",
                    rut: null,
                    email: null,
                    telefono: null,
                    empresaId,
                },
                select: { id_solicitante: true },
            });
            return created.id_solicitante;
        };
        await prisma.$transaction(async (tx) => {
            // ======================================
            // 1️⃣ TRANSFERENCIAS PRINCIPALES
            // ======================================
            if (transferToId) {
                await tx.equipo.updateMany({ where: { idSolicitante: id }, data: { idSolicitante: transferToId } });
                await tx.historial.updateMany({ where: { solicitanteId: id }, data: { solicitanteId: transferToId } });
                await tx.freshdeskRequesterMap.updateMany({ where: { solicitanteId: id }, data: { solicitanteId: transferToId } });
                await tx.freshdeskTicket.updateMany({ where: { solicitanteId: id }, data: { solicitanteId: transferToId } });
                await tx.visita.updateMany({ where: { solicitanteId: id }, data: { solicitanteId: transferToId } });
            }
            else {
                const saId = await ensureSaSolicitante(source.empresaId);
                await tx.equipo.updateMany({ where: { idSolicitante: id }, data: { idSolicitante: saId } });
                await tx.historial.updateMany({ where: { solicitanteId: id }, data: { solicitanteId: saId } });
                await tx.freshdeskRequesterMap.updateMany({ where: { solicitanteId: id }, data: { solicitanteId: saId } });
                await tx.freshdeskTicket.updateMany({
                    where: { solicitanteId: id },
                    data: { solicitanteId: fallback === "sa" ? saId : null },
                });
                await tx.visita.updateMany({
                    where: { solicitanteId: id },
                    data: { solicitanteId: fallback === "sa" ? saId : null },
                });
            }
            // ======================================
            // 2️⃣ LIMPIEZA DE RELACIONES DIRECTAS
            // ======================================
            await tx.solicitanteMsLicense.deleteMany({ where: { solicitanteId: id } });
            await tx.firma.deleteMany({ where: { solicitanteId: id } });
            await tx.servidorUsuario.deleteMany({ where: { solicitanteId: id } });
            await tx.ticket.updateMany({
                where: { requesterId: id },
                data: { requesterId: null },
            });
            // ======================================
            // 3️⃣ DELETE FINAL
            // ======================================
            await tx.solicitante.delete({ where: { id_solicitante: id } });
        }, { timeout: 15000 });
        return res.json({
            ok: true,
            deletedId: id,
            strategy: transferToId ? { type: "transfer", transferToId } : { type: "fallback-SA", fallback },
        });
    }
    catch (err) {
        console.error("[solicitantes.delete] error:", err);
        return res.status(500).json({ error: "No se pudo eliminar el solicitante" });
    }
};
//# sourceMappingURL=solicitantes.controller.js.map