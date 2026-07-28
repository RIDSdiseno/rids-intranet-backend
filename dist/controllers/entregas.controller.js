import { prisma } from "../lib/prisma.js";
/* =========================================================
   LISTADO DE COMPROBANTES DE ENTREGA (vista intranet)
   Muestra las entregas/retiros de TODOS los técnicos, con
   filtros por empresa, técnico, fecha, origen (rids/econnet)
   y tipo (entrega/retiro). Los PDF/evidencias viven en
   Cloudinary; se devuelve su URL directa.
========================================================= */
export async function listarEntregasIntranet(req, res) {
    try {
        const { empresa, tecnicoId, origen, tipo, desde, hasta } = req.query;
        const page = Math.max(1, Number(req.query.page) || 1);
        const limitRaw = Number(req.query.limit);
        const limit = Math.min(100, Math.max(1, Number.isNaN(limitRaw) ? 30 : limitRaw));
        const skip = (page - 1) * limit;
        const where = {};
        if (empresa && empresa.trim()) {
            where.empresaNombre = empresa.trim();
        }
        if (tecnicoId && !Number.isNaN(Number(tecnicoId))) {
            where.tecnicoId = Number(tecnicoId);
        }
        if (origen === "rids" || origen === "econnet") {
            where.origen = origen;
        }
        if (tipo === "entrega" || tipo === "retiro") {
            where.tipo = tipo;
        }
        if (desde || hasta) {
            const rango = {};
            if (desde) {
                const d = new Date(`${desde}T00:00:00`);
                if (!Number.isNaN(d.getTime()))
                    rango.gte = d;
            }
            if (hasta) {
                const h = new Date(`${hasta}T23:59:59.999`);
                if (!Number.isNaN(h.getTime()))
                    rango.lte = h;
            }
            if (rango.gte || rango.lte)
                where.fecha = rango;
        }
        const [total, entregas] = await Promise.all([
            prisma.entrega.count({ where }),
            prisma.entrega.findMany({
                where,
                orderBy: { fecha: "desc" },
                skip,
                take: limit,
                select: {
                    id_entrega: true,
                    empresaNombre: true,
                    receptorNombre: true,
                    fecha: true,
                    origen: true,
                    tipo: true,
                    tecnico: {
                        select: {
                            id_tecnico: true,
                            nombre: true,
                            email: true,
                        },
                    },
                    evidencias: {
                        select: {
                            id: true,
                            tipo: true,
                            url: true,
                            formato: true,
                            creadoEn: true,
                        },
                        orderBy: { creadoEn: "asc" },
                    },
                },
            }),
        ]);
        return res.json({
            entregas,
            page,
            limit,
            total,
            hasMore: skip + entregas.length < total,
        });
    }
    catch (error) {
        console.error("Error al listar entregas (intranet):", error);
        return res.status(500).json({ message: "Error al listar entregas" });
    }
}
/* =========================================================
   OPCIONES PARA LOS FILTROS (empresas y técnicos que tienen
   al menos una entrega registrada).
========================================================= */
export async function listarFiltrosEntregas(_req, res) {
    try {
        const [empresasRaw, tecnicoIdsRaw] = await Promise.all([
            prisma.entrega.findMany({
                distinct: ["empresaNombre"],
                select: { empresaNombre: true },
                orderBy: { empresaNombre: "asc" },
            }),
            prisma.entrega.findMany({
                distinct: ["tecnicoId"],
                where: { tecnicoId: { not: null } },
                select: { tecnicoId: true },
            }),
        ]);
        const empresas = empresasRaw
            .map((e) => e.empresaNombre)
            .filter((nombre) => Boolean(nombre && nombre.trim()));
        const tecnicoIds = tecnicoIdsRaw
            .map((t) => t.tecnicoId)
            .filter((id) => typeof id === "number");
        const tecnicos = tecnicoIds.length
            ? await prisma.tecnico.findMany({
                where: { id_tecnico: { in: tecnicoIds } },
                select: { id_tecnico: true, nombre: true },
                orderBy: { nombre: "asc" },
            })
            : [];
        return res.json({ empresas, tecnicos });
    }
    catch (error) {
        console.error("Error al obtener filtros de entregas:", error);
        return res.status(500).json({ message: "Error al obtener filtros de entregas" });
    }
}
//# sourceMappingURL=entregas.controller.js.map