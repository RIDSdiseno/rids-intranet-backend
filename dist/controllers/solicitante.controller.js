import { prisma } from "../lib/prisma.js";
/* Utils */
const toInt = (v, def = 0) => {
    const n = Number(v);
    return Number.isInteger(n) ? n : def;
};
const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));
/**
 * Listado general (paginado) con filtros por:
 *  - empresaId (opcional)
 *  - q (coincide con nombre de solicitante, nombre de empresa o email)
 */
export const listSolicitantes = async (req, res) => {
    try {
        const q = req.query.q?.trim();
        const empresaId = toInt(req.query.empresaId);
        const page = clamp(toInt(req.query.page, 1), 1, 1_000_000);
        const pageSize = clamp(toInt(req.query.pageSize, 10), 1, 100);
        const skip = (page - 1) * pageSize;
        const INS = "insensitive";
        const where = {
            ...(empresaId > 0 ? { empresaId } : {}),
            ...(q
                ? {
                    OR: [
                        { nombre: { contains: q, mode: INS } },
                        { email: { contains: q, mode: INS } },
                        { empresa: { nombre: { contains: q, mode: INS } } },
                    ],
                }
                : {}),
        };
        const [total, baseSolicitantes] = await Promise.all([
            prisma.solicitante.count({ where }),
            prisma.solicitante.findMany({
                where,
                skip,
                take: pageSize,
                orderBy: [{ nombre: "asc" }, { id_solicitante: "asc" }],
                select: {
                    id_solicitante: true,
                    nombre: true,
                    email: true, // <-- importante
                    empresaId: true,
                },
            }),
        ]);
        // Enriquecer con empresa y equipos
        const empresaIdSet = new Set(baseSolicitantes.map((s) => s.empresaId));
        const solicitanteIdSet = new Set(baseSolicitantes.map((s) => s.id_solicitante));
        const [empresas, equipos] = await Promise.all([
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
        ]);
        const empresaMap = new Map(empresas.map((e) => [e.id_empresa, e]));
        const equiposBySolic = new Map();
        for (const eq of equipos) {
            const list = equiposBySolic.get(eq.idSolicitante) ?? [];
            list.push(eq);
            equiposBySolic.set(eq.idSolicitante, list);
        }
        const items = baseSolicitantes.map((s) => ({
            ...s,
            empresa: empresaMap.get(s.empresaId) ?? null,
            equipos: equiposBySolic.get(s.id_solicitante) ?? [],
        }));
        return res.json({
            page,
            pageSize,
            total,
            totalPages: Math.max(1, Math.ceil(total / pageSize)),
            items,
        });
    }
    catch (err) {
        console.error("[solicitantes.list] error:", err);
        return res
            .status(500)
            .json({ error: "No se pudieron listar los solicitantes" });
    }
};
/**
 * Versión mini para selects del modal:
 *  - Requiere empresaId
 *  - Opcional q para filtrar por nombre (insensible a mayúsculas)
 * Devuelve: { items: [{ id, nombre }] }
 */
export const listSolicitantesByEmpresa = async (req, res) => {
    try {
        const empresaId = toInt(req.query.empresaId);
        if (empresaId <= 0) {
            return res
                .status(400)
                .json({ error: "empresaId requerido y debe ser entero > 0" });
        }
        const q = req.query.q?.trim();
        const where = {
            empresaId,
            ...(q ? { nombre: { contains: q, mode: "insensitive" } } : {}),
        };
        const rows = await prisma.solicitante.findMany({
            where,
            orderBy: [{ nombre: "asc" }, { id_solicitante: "asc" }],
            select: { id_solicitante: true, nombre: true },
        });
        return res.json({
            items: rows.map((s) => ({ id: s.id_solicitante, nombre: s.nombre })),
        });
    }
    catch (err) {
        console.error("[solicitantes.byEmpresa] error:", err);
        return res
            .status(500)
            .json({ error: "No se pudieron obtener solicitantes por empresa" });
    }
};
/**
 * (Opcional recomendado) Métricas rápidas para la cabecera y filtros del frontend:
 *  - Acepta empresaId y q (como listSolicitantes)
 *  - Devuelve totales de solicitantes, empresas distintas y equipos
 * GET /solicitantes/metrics
 */
export const solicitantesMetrics = async (req, res) => {
    try {
        const q = req.query.q?.trim();
        const empresaId = toInt(req.query.empresaId);
        const INS = "insensitive";
        const where = {
            ...(empresaId > 0 ? { empresaId } : {}),
            ...(q
                ? {
                    OR: [
                        { nombre: { contains: q, mode: INS } },
                        { email: { contains: q, mode: INS } },
                        { empresa: { nombre: { contains: q, mode: INS } } },
                    ],
                }
                : {}),
        };
        // solicitantes total
        const solicitantes = await prisma.solicitante.count({ where });
        // empresas distintas (excluyendo null)
        const distinctEmpresas = await prisma.solicitante.findMany({
            where,
            select: { empresaId: true },
            distinct: ["empresaId"],
        });
        const empresas = distinctEmpresas.filter((e) => typeof e.empresaId === "number").length;
        // equipos totales (para todos los solicitantes que hacen match)
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
        return res.json({ solicitantes, empresas, equipos });
    }
    catch (err) {
        console.error("[solicitantes.metrics] error:", err);
        return res
            .status(500)
            .json({ error: "No se pudieron calcular las métricas" });
    }
};
//# sourceMappingURL=solicitante.controller.js.map