import { EstadoVisita } from "@prisma/client";
import { prisma } from "../lib/prisma.js";
/* =======================================================
   GET /api/empresas  (rápido por defecto)
   Query flags:
     - withStats=1  → incluye estadísticas agregadas
     - full=1       → payload completo (pesado)
   ======================================================= */
export async function getEmpresas(req, res) {
    try {
        const withStats = String(req.query.withStats ?? "").toLowerCase() === "1";
        const full = String(req.query.full ?? "").toLowerCase() === "1";
        // Base: empresas (solo id + nombre)
        const empresasBase = await prisma.empresa.findMany({
            select: { id_empresa: true, nombre: true, tieneSucursales: true },
            orderBy: { nombre: "asc" },
        });
        if (empresasBase.length === 0) {
            res.json({ success: true, data: [], total: 0 });
            return;
        }
        const empresaIds = empresasBase.map((e) => e.id_empresa);
        if (full) {
            // ------ FULL: Traemos "todo" con consultas separadas y luego agregamos en memoria
            // DetalleEmpresa (uno a uno por empresa)
            const detalles = await prisma.detalle_empresa.findMany({
                where: { empresa_id: { in: empresaIds } },
            });
            const detallePorEmpresa = new Map(detalles.map((d) => [d.empresa_id, d]));
            // Solicitantes por empresa
            const solicitantes = await prisma.solicitante.findMany({
                where: { empresaId: { in: empresaIds } },
                select: {
                    id_solicitante: true,
                    nombre: true,
                    email: true,
                    empresaId: true,
                },
            });
            // Equipos por solicitante (para armar equipos en solicitantes)
            const solicitanteIds = solicitantes.map((s) => s.id_solicitante);
            const equipos = solicitanteIds.length
                ? await prisma.equipo.findMany({
                    where: { idSolicitante: { in: solicitanteIds } },
                    select: { id_equipo: true, idSolicitante: true },
                })
                : [];
            const equiposPorSolic = new Map();
            for (const eq of equipos) {
                const arr = equiposPorSolic.get(eq.idSolicitante) ?? [];
                arr.push(eq.id_equipo);
                equiposPorSolic.set(eq.idSolicitante, arr);
            }
            // Tickets Freshdesk
            const tickets = await prisma.freshdeskTicket.findMany({
                where: { empresaId: { in: empresaIds } },
                select: { id: true, status: true, empresaId: true },
            });
            // Visitas
            const visitas = await prisma.visita.findMany({
                where: { empresaId: { in: empresaIds } },
                select: { id_visita: true, status: true, empresaId: true },
            });
            // Trabajos (detalle_trabajos)
            const trabajos = await prisma.detalle_trabajo.findMany({
                where: { empresa_id: { in: empresaIds } },
                select: { id: true, estado: true, empresa_id: true },
            });
            // Agrupar solicitantes por empresa
            const solPorEmpresa = new Map();
            for (const s of solicitantes) {
                const eqIds = equiposPorSolic.get(s.id_solicitante) ?? [];
                const entry = {
                    id_solicitante: s.id_solicitante,
                    nombre: s.nombre,
                    email: s.email ?? null,
                    equipos: eqIds.map((id_equipo) => ({ id_equipo })),
                };
                const arr = solPorEmpresa.get(s.empresaId) ?? [];
                arr.push(entry);
                solPorEmpresa.set(s.empresaId, arr);
            }
            // Agrupar tickets/visitas/trabajos por empresa
            const ticketsPorEmpresa = new Map();
            for (const t of tickets) {
                const empId = t.empresaId;
                const arr = ticketsPorEmpresa.get(empId) ?? [];
                arr.push({ id: t.id, status: t.status });
                ticketsPorEmpresa.set(empId, arr);
            }
            const visitasPorEmpresa = new Map();
            for (const v of visitas) {
                const empId = v.empresaId;
                const arr = visitasPorEmpresa.get(empId) ?? [];
                arr.push({ id_visita: v.id_visita, status: v.status });
                visitasPorEmpresa.set(empId, arr);
            }
            const trabajosPorEmpresa = new Map();
            for (const t of trabajos) {
                const empId = t.empresa_id;
                const arr = trabajosPorEmpresa.get(empId) ?? [];
                arr.push({ id: t.id, estado: t.estado });
                trabajosPorEmpresa.set(empId, arr);
            }
            const data = empresasBase.map((e) => {
                const solicitantesEmp = solPorEmpresa.get(e.id_empresa) ?? [];
                const ticketsEmp = ticketsPorEmpresa.get(e.id_empresa) ?? [];
                const visitasEmp = visitasPorEmpresa.get(e.id_empresa) ?? [];
                const trabajosEmp = trabajosPorEmpresa.get(e.id_empresa) ?? [];
                const totalSolicitantes = solicitantesEmp.length;
                const totalEquipos = solicitantesEmp.reduce((acc, s) => acc + (s.equipos?.length || 0), 0);
                const totalTickets = ticketsEmp.length;
                const totalVisitas = visitasEmp.length;
                const totalTrabajos = trabajosEmp.length;
                const ticketsAbiertos = ticketsEmp.filter((t) => t.status !== 5).length;
                const visitasPendientes = visitasEmp.filter((v) => v.status === EstadoVisita.PENDIENTE).length;
                const trabajosPendientes = trabajosEmp.filter((t) => (t.estado ?? "").toUpperCase() === "PENDIENTE").length;
                return {
                    id_empresa: e.id_empresa,
                    nombre: e.nombre,
                    detalleEmpresa: detallePorEmpresa.get(e.id_empresa) ?? null,
                    solicitantes: solicitantesEmp,
                    estadisticas: {
                        totalSolicitantes,
                        totalEquipos,
                        totalTickets,
                        totalVisitas,
                        totalTrabajos,
                        ticketsAbiertos,
                        visitasPendientes,
                        trabajosPendientes,
                    },
                };
            });
            res.json({ success: true, data, total: data.length });
            return;
        }
        // ------- RÁPIDO: sin stats
        if (!withStats) {
            res.json({
                success: true,
                data: empresasBase.map((e) => ({ id_empresa: e.id_empresa, nombre: e.nombre })),
                total: empresasBase.length,
            });
            return;
        }
        // ------- RÁPIDO CON STATS (agregados) -------
        // 1) Solicitantes por empresa
        const solCount = await prisma.solicitante.groupBy({
            by: ["empresaId"],
            where: { empresaId: { in: empresaIds } },
            _count: { empresaId: true },
        });
        // 2) Tickets abiertos por empresa (status != 5)
        const ticketsOpen = await prisma.freshdeskTicket.groupBy({
            by: ["empresaId"],
            where: { empresaId: { in: empresaIds }, status: { not: 5 } },
            _count: { empresaId: true },
        });
        // 3) Visitas pendientes por empresa
        const visitasPend = await prisma.visita.groupBy({
            by: ["empresaId"],
            where: { empresaId: { in: empresaIds }, status: EstadoVisita.PENDIENTE },
            _count: { empresaId: true },
        });
        // 4) Trabajos pendientes por empresa
        const trabajosPend = await prisma.detalle_trabajo.groupBy({
            by: ["empresa_id"],
            where: {
                empresa_id: { in: empresaIds },
                estado: { equals: "PENDIENTE", mode: "insensitive" },
            },
            _count: { empresa_id: true },
        });
        // 5) Equipos por empresa (vía solicitantes)
        const solicitantesDeEmp = await prisma.solicitante.findMany({
            where: { empresaId: { in: empresaIds } },
            select: { id_solicitante: true, empresaId: true },
        });
        const solicIds = solicitantesDeEmp.map((s) => s.id_solicitante);
        const equiposCountPorSolic = solicIds.length
            ? await prisma.equipo.groupBy({
                by: ["idSolicitante"],
                where: { idSolicitante: { in: solicIds } },
                _count: { _all: true },
            })
            : [];
        const empresaPorSolic = new Map(solicitantesDeEmp.map((s) => [s.id_solicitante, s.empresaId]));
        const equiposPorEmpresa = new Map();
        for (const row of equiposCountPorSolic) {
            const empId = empresaPorSolic.get(row.idSolicitante);
            equiposPorEmpresa.set(empId, (equiposPorEmpresa.get(empId) ?? 0) + row._count._all);
        }
        const solMap = new Map(solCount.map((r) => [r.empresaId, r._count.empresaId]));
        const ticketOpenMap = new Map(ticketsOpen.map((r) => [r.empresaId, r._count.empresaId]));
        const visitaPendMap = new Map(visitasPend.map((r) => [r.empresaId, r._count.empresaId]));
        const trabajoPendMap = new Map(trabajosPend.map((r) => [r.empresa_id, r._count.empresa_id]));
        const data = empresasBase.map((e) => ({
            id_empresa: e.id_empresa,
            nombre: e.nombre,
            estadisticas: {
                totalSolicitantes: solMap.get(e.id_empresa) ?? 0,
                totalEquipos: equiposPorEmpresa.get(e.id_empresa) ?? 0,
                totalTickets: undefined,
                totalVisitas: undefined,
                totalTrabajos: undefined,
                ticketsAbiertos: ticketOpenMap.get(e.id_empresa) ?? 0,
                visitasPendientes: visitaPendMap.get(e.id_empresa) ?? 0,
                trabajosPendientes: trabajoPendMap.get(e.id_empresa) ?? 0,
            },
        }));
        res.json({ success: true, data, total: data.length });
    }
    catch (error) {
        console.error("Error al obtener empresas:", error);
        res.status(500).json({ success: false, error: "Error interno del servidor" });
    }
}
/* =======================================================
   GET /api/empresas/stats  (agregado total del sistema)
   ======================================================= */
export async function getEmpresasStats(_req, res) {
    try {
        const [empresas, solicitantes, equipos, tickets, visitas, trabajos] = await Promise.all([
            prisma.empresa.count(),
            prisma.solicitante.count(),
            prisma.equipo.count(),
            prisma.freshdeskTicket.count(),
            prisma.visita.count(),
            prisma.detalle_trabajo.count(),
        ]);
        const ticketsAbiertos = await prisma.freshdeskTicket.count({ where: { status: { not: 5 } } });
        const visitasPendientes = await prisma.visita.count({ where: { status: EstadoVisita.PENDIENTE } });
        const trabajosPendientes = await prisma.detalle_trabajo.count({
            where: { estado: { equals: "PENDIENTE", mode: "insensitive" } },
        });
        res.json({
            success: true,
            data: {
                totalEmpresas: empresas,
                totalSolicitantes: solicitantes,
                totalEquipos: equipos,
                totalTickets: tickets,
                totalVisitas: visitas,
                totalTrabajos: trabajos,
                ticketsAbiertos,
                visitasPendientes,
                trabajosPendientes,
            },
        });
    }
    catch (error) {
        console.error("Error al obtener estadísticas:", error);
        res.status(500).json({ success: false, error: "Error interno del servidor" });
    }
}
/* =======================================================
   GET /api/empresas/:id - OPTIMIZADO (sin relaciones Prisma)
   ======================================================= */
export async function getEmpresaById(req, res) {
    try {
        const id = Number(req.params.id);
        const empresa = await prisma.empresa.findUnique({
            where: { id_empresa: id },
            select: { id_empresa: true, nombre: true, tieneSucursales: true },
        });
        if (!empresa) {
            res.status(404).json({ success: false, error: "Empresa no encontrada" });
            return;
        }
        // Traer anexos por separado
        const [detalle, solicitantes, tickets, visitas, trabajos] = await Promise.all([
            prisma.detalle_empresa.findUnique({ where: { empresa_id: id } }),
            prisma.solicitante.findMany({
                where: { empresaId: id },
                select: { id_solicitante: true, nombre: true, email: true },
            }),
            prisma.freshdeskTicket.findMany({
                where: { empresaId: id },
                select: { id: true, status: true, createdAt: true },
                orderBy: { createdAt: "desc" },
            }),
            prisma.visita.findMany({
                where: { empresaId: id },
                select: { id_visita: true, status: true, inicio: true, fin: true },
                orderBy: { inicio: "desc" },
            }),
            prisma.detalle_trabajo.findMany({
                where: { empresa_id: id },
                select: { id: true, estado: true, fecha_ingreso: true, fecha_egreso: true },
                orderBy: { id: "desc" },
            }),
        ]);
        // Equipos por solicitante
        const solicIds = solicitantes.map((s) => s.id_solicitante);
        const equipos = solicIds.length
            ? await prisma.equipo.findMany({
                where: { idSolicitante: { in: solicIds } },
                select: { id_equipo: true, idSolicitante: true, serial: true, marca: true, modelo: true },
            })
            : [];
        const equiposPorSolic = new Map();
        for (const eq of equipos) {
            const arr = equiposPorSolic.get(eq.idSolicitante) ?? [];
            arr.push(eq);
            equiposPorSolic.set(eq.idSolicitante, arr);
        }
        const solicitantesConEquipos = solicitantes.map((s) => ({
            ...s,
            equipos: (equiposPorSolic.get(s.id_solicitante) ?? []).map((e) => ({
                id_equipo: e.id_equipo,
                serial: e.serial,
                marca: e.marca,
                modelo: e.modelo,
            })),
        }));
        res.json({
            success: true,
            data: {
                ...empresa,
                detalleEmpresa: detalle ?? null,
                solicitantes: solicitantesConEquipos,
                tickets,
                visitas,
                detalleTrabajos: trabajos,
            },
        });
    }
    catch (error) {
        console.error("Error al obtener empresa:", error);
        res.status(500).json({ success: false, error: "Error interno del servidor" });
    }
}
/* =======================================================
   POST /api/empresas - SIN nested create (no hay relación Prisma)
   ======================================================= */
export async function createEmpresa(req, res) {
    try {
        const { nombre, rut, direccion, telefono, email } = req.body;
        if ((rut || direccion || telefono || email) && (!rut || !direccion || !telefono || !email)) {
            res.status(400).json({
                success: false,
                error: "Si se proporciona detalle de empresa, todos los campos (rut, direccion, telefono, email) son obligatorios",
            });
            return;
        }
        const result = await prisma.$transaction(async (tx) => {
            const nueva = await tx.empresa.create({
                data: { nombre },
                select: { id_empresa: true, nombre: true, tieneSucursales: true },
            });
            let detalle = null;
            if (rut && direccion && telefono && email) {
                detalle = await tx.detalle_empresa.create({
                    data: { rut, direccion, telefono, email, empresa_id: nueva.id_empresa },
                });
            }
            return { nueva, detalle };
        });
        res.status(201).json({
            success: true,
            data: { ...result.nueva, detalleEmpresa: result.detalle },
        });
    }
    catch (error) {
        console.error("Error al crear empresa:", error);
        if (error.code === "P2002") {
            const field = error.meta?.target?.[0];
            const errorMessage = field === "nombre" ? "El nombre de la empresa ya existe" : "El RUT de la empresa ya existe";
            res.status(400).json({ success: false, error: errorMessage });
            return;
        }
        res.status(500).json({ success: false, error: "Error al crear empresa" });
    }
}
/* =======================================================
   PUT /api/empresas/:id - SIN nested update
   ======================================================= */
export async function updateEmpresa(req, res) {
    try {
        const id = Number(req.params.id);
        const { nombre, rut, direccion, telefono, email } = req.body;
        if ((rut || direccion || telefono || email) && (!rut || !direccion || !telefono || !email)) {
            res.status(400).json({
                success: false,
                error: "Si se proporciona detalle de empresa, todos los campos (rut, direccion, telefono, email) son obligatorios",
            });
            return;
        }
        const empresaExistente = await prisma.empresa.findUnique({
            where: { id_empresa: id },
            select: { id_empresa: true },
        });
        if (!empresaExistente) {
            res.status(404).json({ success: false, error: "Empresa no encontrada" });
            return;
        }
        const result = await prisma.$transaction(async (tx) => {
            if (typeof nombre === "string") {
                await tx.empresa.update({ where: { id_empresa: id }, data: { nombre } });
            }
            let detalle = await tx.detalle_empresa.findUnique({ where: { empresa_id: id } });
            if (rut && direccion && telefono && email) {
                // upsert manual
                if (detalle) {
                    detalle = await tx.detalle_empresa.update({
                        where: { empresa_id: id },
                        data: { rut, direccion, telefono, email },
                    });
                }
                else {
                    detalle = await tx.detalle_empresa.create({
                        data: { rut, direccion, telefono, email, empresa_id: id },
                    });
                }
            }
            const empresaAct = await tx.empresa.findUnique({
                where: { id_empresa: id },
                select: { id_empresa: true, nombre: true, tieneSucursales: true },
            });
            return { empresaAct, detalle };
        });
        res.json({ success: true, data: { ...result.empresaAct, detalleEmpresa: result.detalle } });
    }
    catch (error) {
        console.error("Error al actualizar empresa:", error);
        if (error.code === "P2002") {
            const field = error.meta?.target?.[0];
            const errorMessage = field === "nombre" ? "El nombre de la empresa ya existe" : "El RUT de la empresa ya existe";
            res.status(400).json({ success: false, error: errorMessage });
            return;
        }
        res.status(500).json({ success: false, error: "Error al actualizar empresa" });
    }
}
/* =======================================================
   DELETE /api/empresas/:id
   ======================================================= */
export async function deleteEmpresa(req, res) {
    try {
        const id = Number(req.params.id);
        const existe = await prisma.empresa.findUnique({
            where: { id_empresa: id },
            select: { id_empresa: true },
        });
        if (!existe) {
            res.status(404).json({ success: false, error: "Empresa no encontrada" });
            return;
        }
        // Verificaciones de registros relacionados (sin relaciones Prisma)
        const [solCount, tkCount, vsCount, trCount] = await Promise.all([
            prisma.solicitante.count({ where: { empresaId: id } }),
            prisma.freshdeskTicket.count({ where: { empresaId: id } }),
            prisma.visita.count({ where: { empresaId: id } }),
            prisma.detalle_trabajo.count({ where: { empresa_id: id } }),
        ]);
        if (solCount > 0 || tkCount > 0 || vsCount > 0 || trCount > 0) {
            res.status(400).json({
                success: false,
                error: "No se puede eliminar la empresa porque tiene registros relacionados (solicitantes, tickets, visitas o trabajos)",
            });
            return;
        }
        await prisma.$transaction(async (tx) => {
            // borrar detalle si existe
            const detalle = await tx.detalle_empresa.findUnique({ where: { empresa_id: id } });
            if (detalle) {
                await tx.detalle_empresa.delete({ where: { empresa_id: id } });
            }
            await tx.empresa.delete({ where: { id_empresa: id } });
        });
        res.json({ success: true, message: "Empresa eliminada correctamente" });
    }
    catch (error) {
        console.error("Error al eliminar empresa:", error);
        if (error.code === "P2003") {
            res.status(400).json({
                success: false,
                error: "No se puede eliminar la empresa porque tiene registros relacionados",
            });
            return;
        }
        res.status(500).json({ success: false, error: "Error al eliminar empresa" });
    }
}
//# sourceMappingURL=empresas.controller.js.map