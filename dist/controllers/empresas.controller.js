import { Prisma } from "@prisma/client";
import { EstadoVisita } from "@prisma/client";
import { prisma } from "../lib/prisma.js";
// Util para normalizar dominios ingresados (string o array) a formato consistente
function normalizeDominios(input) {
    if (input === undefined || input === null)
        return [];
    const raw = Array.isArray(input)
        ? input
        : String(input).split(",");
    const dominios = raw
        .map((d) => String(d).trim().toLowerCase())
        .map((d) => d.replace(/^@+/, ""))
        .map((d) => d.replace(/^https?:\/\//, ""))
        .map((d) => d.replace(/^www\./, ""))
        .map((d) => d.split("/")[0] ?? "")
        .map((d) => d.split(":")[0] ?? "")
        .map((d) => d.trim())
        .filter((d) => d.length > 0);
    return Array.from(new Set(dominios));
}
function parseEstadoEmpresa(value) {
    const estado = String(value ?? "ACTIVAS")
        .trim()
        .toUpperCase();
    if (estado === "INACTIVAS" ||
        estado === "TODAS") {
        return estado;
    }
    return "ACTIVAS";
}
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
        const user = req.user;
        const estado = parseEstadoEmpresa(req.query.estado);
        const puedeVerInactivas = [
            "ADMIN",
            "ADMINISTRACION",
        ].includes(String(user?.rol ?? ""));
        const estadoAplicado = puedeVerInactivas
            ? estado
            : "ACTIVAS";
        let whereEmpresa;
        if (user?.rol === "CLIENTE") {
            whereEmpresa = {
                id_empresa: Number(user.empresaId),
                isActive: true,
            };
        }
        else {
            whereEmpresa =
                estadoAplicado === "TODAS"
                    ? {}
                    : estadoAplicado === "INACTIVAS"
                        ? {
                            isActive: false,
                        }
                        : {
                            isActive: true,
                        };
        }
        const empresasBase = await prisma.empresa.findMany({
            where: whereEmpresa,
            select: {
                id_empresa: true,
                nombre: true,
                tieneSucursales: true,
                dominios: true,
                isActive: true,
                deactivatedAt: true,
            },
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
            const detalles = await prisma.detalleEmpresa.findMany({
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
                if (eq.idSolicitante == null)
                    continue;
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
            // Armar respuesta final combinando todo
            const data = empresasBase.map((e) => {
                const solicitantesEmp = solPorEmpresa.get(e.id_empresa) ?? [];
                const ticketsEmp = ticketsPorEmpresa.get(e.id_empresa) ?? [];
                const visitasEmp = visitasPorEmpresa.get(e.id_empresa) ?? [];
                const totalSolicitantes = solicitantesEmp.length;
                const totalEquipos = solicitantesEmp.reduce((acc, s) => acc + (s.equipos?.length || 0), 0);
                const totalTickets = ticketsEmp.length;
                const totalVisitas = visitasEmp.length;
                const ticketsAbiertos = ticketsEmp.filter((t) => t.status !== 5).length;
                const visitasPendientes = visitasEmp.filter((v) => v.status === EstadoVisita.PENDIENTE).length;
                return {
                    id_empresa: e.id_empresa,
                    nombre: e.nombre,
                    tieneSucursales: e.tieneSucursales,
                    dominios: e.dominios ?? [],
                    dominioPrincipal: e.dominios?.[0] ?? null,
                    isActive: e.isActive,
                    deactivatedAt: e.deactivatedAt,
                    detalleEmpresa: detallePorEmpresa.get(e.id_empresa) ?? null,
                    solicitantes: solicitantesEmp,
                    estadisticas: {
                        totalSolicitantes,
                        totalEquipos,
                        totalTickets,
                        totalVisitas,
                        ticketsAbiertos,
                        visitasPendientes,
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
                data: empresasBase.map((e) => ({
                    id_empresa: e.id_empresa,
                    nombre: e.nombre,
                    tieneSucursales: e.tieneSucursales,
                    dominios: e.dominios ?? [],
                    dominioPrincipal: e.dominios?.[0] ?? null,
                    isActive: e.isActive,
                    deactivatedAt: e.deactivatedAt,
                })),
                total: empresasBase.length,
            });
            return;
        }
        // ------- RÁPIDO CON STATS (agregados) -------
        // 1) Solicitantes activos por empresa
        const solCount = await prisma.solicitante.groupBy({
            by: ["empresaId"],
            where: {
                empresaId: { in: empresaIds },
                isActive: true,
            },
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
        // 4) TOTAL visitas por empresa
        const visitasTotal = await prisma.visita.groupBy({
            by: ["empresaId"],
            where: { empresaId: { in: empresaIds } },
            _count: { _all: true },
        });
        // 4.1) TOTAL tickets por empresa
        const ticketsTotal = await prisma.freshdeskTicket.groupBy({
            by: ["empresaId"],
            where: { empresaId: { in: empresaIds } },
            _count: { _all: true },
        });
        const visitasTotalMap = new Map(visitasTotal.map(r => [r.empresaId, r._count._all]));
        const ticketsTotalMap = new Map(ticketsTotal.map(r => [r.empresaId, r._count._all]));
        // 5) Equipos por empresa (vía solicitantes)
        const solicitantesDeEmp = await prisma.solicitante.findMany({
            where: {
                empresaId: { in: empresaIds },
            },
            select: { id_solicitante: true, empresaId: true },
        });
        const solicIds = solicitantesDeEmp.map((s) => s.id_solicitante);
        const equiposCountPorSolic = solicIds.length
            ? await prisma.equipo.groupBy({
                by: ["idSolicitante"],
                where: {
                    deletedAt: null,
                    idSolicitante: { in: solicIds },
                },
                _count: { _all: true },
            })
            : [];
        const empresaPorSolic = new Map(solicitantesDeEmp.map((s) => [s.id_solicitante, s.empresaId]));
        const equiposPorEmpresa = new Map();
        for (const row of equiposCountPorSolic) {
            if (row.idSolicitante == null)
                continue;
            const empId = empresaPorSolic.get(row.idSolicitante);
            if (empId == null)
                continue;
            equiposPorEmpresa.set(empId, (equiposPorEmpresa.get(empId) ?? 0) + row._count._all);
        }
        const solMap = new Map(solCount.map((r) => [r.empresaId, r._count.empresaId]));
        const ticketOpenMap = new Map(ticketsOpen.map((r) => [r.empresaId, r._count.empresaId]));
        const visitaPendMap = new Map(visitasPend.map((r) => [r.empresaId, r._count.empresaId]));
        // DetalleEmpresa (opcional)
        const detalles = await prisma.detalleEmpresa.findMany({
            where: { empresa_id: { in: empresaIds } },
        });
        const detallePorEmpresa = new Map(detalles.map((d) => [d.empresa_id, d]));
        const data = empresasBase.map((e) => ({
            id_empresa: e.id_empresa,
            nombre: e.nombre,
            tieneSucursales: e.tieneSucursales,
            dominios: e.dominios ?? [],
            dominioPrincipal: e.dominios?.[0] ?? null,
            isActive: e.isActive,
            deactivatedAt: e.deactivatedAt,
            detalleEmpresa: detallePorEmpresa.get(e.id_empresa) ?? null,
            estadisticas: {
                totalSolicitantes: solMap.get(e.id_empresa) ?? 0,
                totalEquipos: equiposPorEmpresa.get(e.id_empresa) ?? 0,
                totalTickets: ticketsTotalMap.get(e.id_empresa) ?? 0,
                totalVisitas: visitasTotalMap.get(e.id_empresa) ?? 0,
                totalTrabajos: 0,
                ticketsAbiertos: ticketOpenMap.get(e.id_empresa) ?? 0,
                visitasPendientes: visitaPendMap.get(e.id_empresa) ?? 0,
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
   GET /api/empresas/stats
   Estadísticas actuales: solo empresas activas
   ======================================================= */
export async function getEmpresasStats(req, res) {
    try {
        const user = req.user;
        if (user?.rol === "CLIENTE") {
            res.status(403).json({
                success: false,
                error: "No autorizado",
            });
            return;
        }
        const [empresasActivas, empresasInactivas, solicitantes, equipos, tickets, visitas, ticketsAbiertos, visitasPendientes,] = await Promise.all([
            prisma.empresa.count({
                where: {
                    isActive: true,
                },
            }),
            prisma.empresa.count({
                where: {
                    isActive: false,
                },
            }),
            prisma.solicitante.count({
                where: {
                    isActive: true,
                    deletedAt: null,
                    empresa: {
                        is: {
                            isActive: true,
                        },
                    },
                },
            }),
            prisma.equipo.count({
                where: {
                    deletedAt: null,
                    OR: [
                        {
                            empresa: {
                                is: {
                                    isActive: true,
                                },
                            },
                        },
                        {
                            solicitante: {
                                is: {
                                    empresa: {
                                        is: {
                                            isActive: true,
                                        },
                                    },
                                },
                            },
                        },
                    ],
                },
            }),
            prisma.freshdeskTicket.count({
                where: {
                    empresa: {
                        is: {
                            isActive: true,
                        },
                    },
                },
            }),
            prisma.visita.count({
                where: {
                    empresa: {
                        is: {
                            isActive: true,
                        },
                    },
                },
            }),
            prisma.freshdeskTicket.count({
                where: {
                    status: {
                        not: 5,
                    },
                    empresa: {
                        is: {
                            isActive: true,
                        },
                    },
                },
            }),
            prisma.visita.count({
                where: {
                    status: EstadoVisita.PENDIENTE,
                    empresa: {
                        is: {
                            isActive: true,
                        },
                    },
                },
            }),
        ]);
        res.json({
            success: true,
            data: {
                totalEmpresas: empresasActivas,
                totalEmpresasActivas: empresasActivas,
                totalEmpresasInactivas: empresasInactivas,
                totalSolicitantes: solicitantes,
                totalEquipos: equipos,
                totalTickets: tickets,
                totalVisitas: visitas,
                ticketsAbiertos,
                visitasPendientes,
            },
        });
    }
    catch (error) {
        console.error("Error al obtener estadísticas:", error);
        res.status(500).json({
            success: false,
            error: "Error interno del servidor",
        });
    }
}
/* =======================================================
   GET /api/empresas/:id - OPTIMIZADO (sin relaciones Prisma)
   ======================================================= */
export async function getEmpresaById(req, res) {
    try {
        const id = Number(req.params.id);
        const user = req.user;
        if (user?.rol === "CLIENTE" && user.empresaId !== id) {
            res.status(403).json({ error: "No autorizado" });
            return;
        }
        const empresa = await prisma.empresa.findUnique({
            where: { id_empresa: id },
            select: {
                id_empresa: true,
                nombre: true,
                tieneSucursales: true,
                dominios: true,
                isActive: true,
                deactivatedAt: true,
            },
        });
        if (!empresa) {
            res.status(404).json({ success: false, error: "Empresa no encontrada" });
            return;
        }
        if (user?.rol === "CLIENTE" && !empresa.isActive) {
            res.status(403).json({
                success: false,
                error: "La empresa se encuentra inactiva",
            });
            return;
        }
        // Traer anexos por separado
        const [detalle, solicitantes, tickets, visitas] = await Promise.all([
            prisma.detalleEmpresa.findUnique({ where: { empresa_id: id } }),
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
        ]);
        // Equipos por solicitante
        const solicIds = solicitantes.map((s) => s.id_solicitante);
        const equipos = solicIds.length
            ? await prisma.equipo.findMany({
                where: { idSolicitante: { in: solicIds } },
                select: {
                    id_equipo: true,
                    idSolicitante: true,
                    serial: true,
                    marca: true,
                    modelo: true,
                },
            })
            : [];
        const equiposPorSolic = new Map();
        for (const eq of equipos) {
            if (eq.idSolicitante == null)
                continue;
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
            },
        });
    }
    catch (error) {
        console.error("Error al obtener empresa:", error);
        res.status(500).json({ success: false, error: "Error interno del servidor" });
    }
}
/* =======================================================
   POST /api/empresas - SIN nested create (usa DetalleEmpresa separado)
   ======================================================= */
export async function createEmpresa(req, res) {
    try {
        const { nombre, rut, direccion, telefono, email, dominios } = req.body;
        if (!nombre || !String(nombre).trim()) {
            res.status(400).json({
                success: false,
                error: "El nombre de la empresa es obligatorio",
            });
            return;
        }
        if ((rut || direccion || telefono || email) && (!rut || !direccion || !telefono || !email)) {
            res.status(400).json({
                success: false,
                error: "Si se proporciona detalle de empresa, todos los campos (rut, direccion, telefono, email) son obligatorios",
            });
            return;
        }
        const dominiosNormalizados = normalizeDominios(dominios);
        const result = await prisma.$transaction(async (tx) => {
            const nueva = await tx.empresa.create({
                data: {
                    nombre: String(nombre).trim(),
                    dominios: dominiosNormalizados,
                },
                select: {
                    id_empresa: true,
                    nombre: true,
                    tieneSucursales: true,
                    dominios: true,
                    isActive: true,
                    deactivatedAt: true,
                },
            });
            let detalle = null;
            if (rut && direccion && telefono && email) {
                detalle = await tx.detalleEmpresa.create({
                    data: {
                        rut,
                        direccion,
                        telefono,
                        email,
                        empresa_id: nueva.id_empresa,
                    },
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
            const errorMessage = field === "nombre"
                ? "El nombre de la empresa ya existe"
                : "El RUT de la empresa ya existe";
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
        const { nombre, rut, direccion, telefono, email, dominios } = req.body;
        if (!Number.isInteger(id) || id <= 0) {
            res.status(400).json({ success: false, error: "ID inválido" });
            return;
        }
        if ((rut || direccion || telefono || email) && (!rut || !direccion || !telefono || !email)) {
            res.status(400).json({
                success: false,
                error: "Si se proporciona detalle de empresa, todos los campos (rut, direccion, telefono, email) son obligatorios",
            });
            return;
        }
        const empresaExistente = await prisma.empresa.findUnique({
            where: {
                id_empresa: id,
            },
            select: {
                id_empresa: true,
                isActive: true,
            },
        });
        if (!empresaExistente) {
            res.status(404).json({ success: false, error: "Empresa no encontrada" });
            return;
        }
        if (!empresaExistente.isActive) {
            res.status(409).json({
                success: false,
                code: "EMPRESA_INACTIVA",
                error: "La empresa se encuentra inactiva. Debes reactivarla antes de modificar sus datos.",
            });
            return;
        }
        const result = await prisma.$transaction(async (tx) => {
            const dataEmpresa = {};
            if (typeof nombre === "string") {
                dataEmpresa.nombre = nombre.trim();
            }
            if (dominios !== undefined) {
                dataEmpresa.dominios = normalizeDominios(dominios);
            }
            if (Object.keys(dataEmpresa).length > 0) {
                await tx.empresa.update({
                    where: { id_empresa: id },
                    data: dataEmpresa,
                });
            }
            let detalle = await tx.detalleEmpresa.findUnique({
                where: { empresa_id: id },
            });
            if (rut && direccion && telefono && email) {
                if (detalle) {
                    detalle = await tx.detalleEmpresa.update({
                        where: { empresa_id: id },
                        data: { rut, direccion, telefono, email },
                    });
                }
                else {
                    detalle = await tx.detalleEmpresa.create({
                        data: {
                            rut,
                            direccion,
                            telefono,
                            email,
                            empresa_id: id,
                        },
                    });
                }
            }
            const empresaAct = await tx.empresa.findUnique({
                where: {
                    id_empresa: id,
                },
                select: {
                    id_empresa: true,
                    nombre: true,
                    tieneSucursales: true,
                    dominios: true,
                    isActive: true,
                    deactivatedAt: true,
                },
            });
            return { empresaAct, detalle };
        });
        res.json({
            success: true,
            data: { ...result.empresaAct, detalleEmpresa: result.detalle },
        });
    }
    catch (error) {
        console.error("Error al actualizar empresa:", error);
        if (error.code === "P2002") {
            const field = error.meta?.target?.[0];
            const errorMessage = field === "nombre"
                ? "El nombre de la empresa ya existe"
                : "El RUT de la empresa ya existe";
            res.status(400).json({ success: false, error: errorMessage });
            return;
        }
        res.status(500).json({ success: false, error: "Error al actualizar empresa" });
    }
}
/* =======================================================
   PATCH /api/empresas/:id/status
   Activa o desactiva una empresa sin eliminar sus datos
   ======================================================= */
export async function updateEmpresaStatus(req, res) {
    try {
        const id = Number(req.params.id);
        const isActive = req.body?.isActive;
        const user = req.user;
        if (!Number.isInteger(id) || id <= 0) {
            res.status(400).json({
                success: false,
                error: "ID inválido",
            });
            return;
        }
        if (typeof isActive !== "boolean") {
            res.status(400).json({
                success: false,
                error: "El campo isActive debe ser true o false",
            });
            return;
        }
        if (!["ADMIN", "ADMINISTRACION"].includes(String(user?.rol ?? ""))) {
            res.status(403).json({
                success: false,
                error: "No tienes permisos para cambiar el estado de una empresa",
            });
            return;
        }
        const empresaActual = await prisma.empresa.findUnique({
            where: {
                id_empresa: id,
            },
            select: {
                id_empresa: true,
                nombre: true,
                isActive: true,
                deactivatedAt: true,
            },
        });
        if (!empresaActual) {
            res.status(404).json({
                success: false,
                error: "Empresa no encontrada",
            });
            return;
        }
        if (empresaActual.isActive === isActive) {
            res.json({
                success: true,
                message: isActive
                    ? "La empresa ya se encuentra activa"
                    : "La empresa ya se encuentra inactiva",
                data: empresaActual,
            });
            return;
        }
        const empresaActualizada = await prisma.empresa.update({
            where: {
                id_empresa: id,
            },
            data: {
                isActive,
                deactivatedAt: isActive
                    ? null
                    : new Date(),
            },
            select: {
                id_empresa: true,
                nombre: true,
                tieneSucursales: true,
                dominios: true,
                isActive: true,
                deactivatedAt: true,
            },
        });
        res.json({
            success: true,
            message: isActive
                ? "Empresa reactivada correctamente"
                : "Empresa desactivada correctamente",
            data: empresaActualizada,
        });
    }
    catch (error) {
        console.error("Error actualizando estado de empresa:", error);
        res.status(500).json({
            success: false,
            error: "Error al actualizar el estado de la empresa",
        });
    }
}
/* =======================================================
   DELETE /api/empresas/:id
   Compatibilidad: realiza desactivación lógica
   ======================================================= */
export async function deleteEmpresa(req, res) {
    try {
        const id = Number(req.params.id);
        const user = req.user;
        if (!Number.isInteger(id) || id <= 0) {
            res.status(400).json({
                success: false,
                error: "ID inválido",
            });
            return;
        }
        if (!["ADMIN", "ADMINISTRACION"].includes(String(user?.rol ?? ""))) {
            res.status(403).json({
                success: false,
                error: "No tienes permisos para desactivar empresas",
            });
            return;
        }
        const empresa = await prisma.empresa.findUnique({
            where: {
                id_empresa: id,
            },
            select: {
                id_empresa: true,
                nombre: true,
                isActive: true,
                deactivatedAt: true,
            },
        });
        if (!empresa) {
            res.status(404).json({
                success: false,
                error: "Empresa no encontrada",
            });
            return;
        }
        if (!empresa.isActive) {
            res.json({
                success: true,
                message: "La empresa ya se encuentra inactiva",
                data: empresa,
            });
            return;
        }
        const empresaDesactivada = await prisma.empresa.update({
            where: {
                id_empresa: id,
            },
            data: {
                isActive: false,
                deactivatedAt: new Date(),
            },
            select: {
                id_empresa: true,
                nombre: true,
                isActive: true,
                deactivatedAt: true,
            },
        });
        res.json({
            success: true,
            message: "Empresa desactivada correctamente. Sus datos históricos se conservaron.",
            data: empresaDesactivada,
        });
    }
    catch (error) {
        console.error("Error desactivando empresa:", error);
        res.status(500).json({
            success: false,
            error: "Error al desactivar empresa",
        });
    }
}
//# sourceMappingURL=empresas.controller.js.map