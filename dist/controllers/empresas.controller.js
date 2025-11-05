import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();
/* ================ CACHE PARA DATOS FRECUENTES ================ */
const empresasCache = {
    listado: null,
    stats: null,
};
const CACHE_TTL = 30000; // 30 segundos
function clearEmpresasCache() {
    empresasCache.listado = null;
    empresasCache.stats = null;
}
/* ================ SELECTS OPTIMIZADOS BASADOS EN TU ESQUEMA ================ */
const empresaListSelect = {
    id_empresa: true,
    nombre: true,
    detalleEmpresa: true,
    solicitantes: {
        select: {
            id_solicitante: true,
            nombre: true,
            email: true,
            _count: {
                select: {
                    equipos: true
                }
            }
        }
    },
    _count: {
        select: {
            tickets: true,
            visitas: true,
            detalleTrabajos: true
        }
    }
};
/* =======================================================
   GET /api/empresas - OPTIMIZADO
   ======================================================= */
export async function getEmpresas(req, res) {
    const startTime = Date.now();
    try {
        // ✅ VERIFICAR CACHE PRIMERO
        if (empresasCache.listado && Date.now() - empresasCache.listado.timestamp < CACHE_TTL) {
            console.log(`✅ Cache hit para empresas listado: ${Date.now() - startTime}ms`);
            res.json(empresasCache.listado.data);
            return;
        }
        // ✅ OBTENER DATOS ADICIONALES EN PARALELO PARA ESTADÍSTICAS
        const [empresas, ticketsAbiertosPorEmpresa, visitasPendientesPorEmpresa, trabajosPendientesPorEmpresa] = await Promise.all([
            // Empresas básicas
            prisma.empresa.findMany({
                select: empresaListSelect,
                orderBy: { nombre: "asc" },
            }),
            // Tickets abiertos por empresa (status ≠ 5)
            prisma.freshdeskTicket.groupBy({
                by: ['empresaId'],
                where: {
                    empresaId: { not: null },
                    status: { not: 5 }
                },
                _count: { _all: true }
            }),
            // Visitas pendientes por empresa
            prisma.visita.groupBy({
                by: ['empresaId'],
                where: {
                    status: "PENDIENTE"
                },
                _count: { _all: true }
            }),
            // Trabajos pendientes por empresa
            prisma.detalleTrabajo.groupBy({
                by: ['empresa_id'],
                where: {
                    empresa_id: { not: null },
                    OR: [
                        { estado: "pendiente" },
                        { estado: "PENDIENTE" }
                    ]
                },
                _count: { _all: true }
            })
        ]);
        // ✅ CREAR MAPAS PARA ACCESO RÁPIDO
        const ticketsAbiertosMap = new Map(ticketsAbiertosPorEmpresa.map(t => [t.empresaId, t._count._all]));
        const visitasPendientesMap = new Map(visitasPendientesPorEmpresa.map(v => [v.empresaId, v._count._all]));
        const trabajosPendientesMap = new Map(trabajosPendientesPorEmpresa.map(t => [t.empresa_id, t._count._all]));
        // ✅ CALCULAR ESTADÍSTICAS CON DATOS PRE-CALCULADOS
        const empresasConStats = empresas.map((empresa) => {
            const totalSolicitantes = empresa.solicitantes.length;
            const totalEquipos = empresa.solicitantes.reduce((acc, sol) => acc + (sol._count?.equipos || 0), 0);
            const totalTickets = empresa._count.tickets;
            const totalVisitas = empresa._count.visitas;
            const totalTrabajos = empresa._count.detalleTrabajos;
            return {
                id_empresa: empresa.id_empresa,
                nombre: empresa.nombre,
                detalleEmpresa: empresa.detalleEmpresa,
                solicitantes: empresa.solicitantes.map(sol => ({
                    id_solicitante: sol.id_solicitante,
                    nombre: sol.nombre,
                    email: sol.email,
                    totalEquipos: sol._count?.equipos || 0
                })),
                estadisticas: {
                    totalSolicitantes,
                    totalEquipos,
                    totalTickets,
                    totalVisitas,
                    totalTrabajos,
                    ticketsAbiertos: ticketsAbiertosMap.get(empresa.id_empresa) || 0,
                    visitasPendientes: visitasPendientesMap.get(empresa.id_empresa) || 0,
                    trabajosPendientes: trabajosPendientesMap.get(empresa.id_empresa) || 0,
                },
            };
        });
        const result = {
            success: true,
            data: empresasConStats,
            total: empresasConStats.length
        };
        // ✅ GUARDAR EN CACHE
        empresasCache.listado = {
            data: result,
            timestamp: Date.now()
        };
        const endTime = Date.now();
        console.log(`Tiempo getEmpresas: ${endTime - startTime}ms`);
        res.json(result);
    }
    catch (error) {
        console.error("Error al obtener empresas:", error);
        res.status(500).json({
            success: false,
            error: "Error interno del servidor"
        });
    }
}
/* =======================================================
   GET /api/empresas/stats - OPTIMIZADO
   ======================================================= */
export async function getEmpresasStats(req, res) {
    const startTime = Date.now();
    try {
        // ✅ VERIFICAR CACHE PRIMERO
        if (empresasCache.stats && Date.now() - empresasCache.stats.timestamp < CACHE_TTL) {
            console.log(`✅ Cache hit para empresas stats: ${Date.now() - startTime}ms`);
            res.json(empresasCache.stats.data);
            return;
        }
        // ✅ CONSULTAS ESPECÍFICAS Y PARALELAS
        const [totalEmpresas, totalSolicitantes, totalEquipos, totalTickets, totalVisitas, totalTrabajos, ticketsAbiertos, visitasPendientes, trabajosPendientes] = await Promise.all([
            prisma.empresa.count(),
            prisma.solicitante.count(),
            prisma.equipo.count(),
            prisma.freshdeskTicket.count(),
            prisma.visita.count(),
            prisma.detalleTrabajo.count(),
            prisma.freshdeskTicket.count({
                where: {
                    status: { not: 5 }
                }
            }),
            prisma.visita.count({
                where: {
                    status: "PENDIENTE"
                }
            }),
            prisma.detalleTrabajo.count({
                where: {
                    OR: [
                        { estado: "pendiente" },
                        { estado: "PENDIENTE" }
                    ]
                }
            })
        ]);
        const statsTotales = {
            totalEmpresas,
            totalSolicitantes,
            totalEquipos,
            totalTickets,
            totalVisitas,
            totalTrabajos,
            ticketsAbiertos,
            visitasPendientes,
            trabajosPendientes,
        };
        const result = {
            success: true,
            data: statsTotales
        };
        // ✅ GUARDAR EN CACHE
        empresasCache.stats = {
            data: result,
            timestamp: Date.now()
        };
        const endTime = Date.now();
        console.log(`Tiempo getEmpresasStats: ${endTime - startTime}ms`);
        res.json(result);
    }
    catch (error) {
        console.error("Error al obtener estadísticas:", error);
        res.status(500).json({
            success: false,
            error: "Error interno del servidor"
        });
    }
}
/* =======================================================
   GET /api/empresas/:id - OPTIMIZADO
   ======================================================= */
export async function getEmpresaById(req, res) {
    const startTime = Date.now();
    try {
        const id = Number(req.params.id);
        // ✅ SELECT ESPECÍFICO BASADO EN TU ESQUEMA
        const empresa = await prisma.empresa.findUnique({
            where: { id_empresa: id },
            select: {
                id_empresa: true,
                nombre: true,
                detalleEmpresa: true,
                companyMaps: {
                    select: {
                        companyId: true,
                        domain: true
                    }
                },
                // ✅ SOLICITANTES CON DATOS LIMITADOS
                solicitantes: {
                    select: {
                        id_solicitante: true,
                        nombre: true,
                        email: true,
                        telefono: true,
                        equipos: {
                            select: {
                                id_equipo: true,
                                serial: true,
                                marca: true,
                                modelo: true,
                                procesador: true,
                                propiedad: true
                            },
                            take: 20 // ✅ LIMITAR EQUIPOS POR SOLICITANTE
                        },
                        _count: {
                            select: {
                                tickets: true,
                                visitas: true
                            }
                        }
                    }
                },
                // ✅ TICKETS RECIENTES
                tickets: {
                    select: {
                        id: true,
                        subject: true,
                        status: true,
                        priority: true,
                        type: true,
                        createdAt: true
                    },
                    take: 50,
                    orderBy: { createdAt: 'desc' }
                },
                // ✅ VISITAS RECIENTES
                visitas: {
                    select: {
                        id_visita: true,
                        inicio: true,
                        fin: true,
                        status: true,
                        tecnico: {
                            select: {
                                nombre: true
                            }
                        },
                        solicitante: true
                    },
                    take: 50,
                    orderBy: { inicio: 'desc' }
                },
                // ✅ TRABAJOS RECIENTES
                detalleTrabajos: {
                    select: {
                        id: true,
                        fecha_ingreso: true,
                        trabajo: true,
                        prioridad: true,
                        estado: true,
                        equipo: {
                            select: {
                                serial: true,
                                marca: true
                            }
                        },
                        tecnico: {
                            select: {
                                nombre: true
                            }
                        }
                    },
                    take: 50,
                    orderBy: { fecha_ingreso: 'desc' }
                }
            }
        });
        if (!empresa) {
            res.status(404).json({
                success: false,
                error: "Empresa no encontrada"
            });
            return;
        }
        const endTime = Date.now();
        console.log(`⏱️ Tiempo getEmpresaById: ${endTime - startTime}ms`);
        res.json({
            success: true,
            data: empresa
        });
    }
    catch (error) {
        console.error("Error al obtener empresa:", error);
        res.status(500).json({
            success: false,
            error: "Error interno del servidor"
        });
    }
}
/* =======================================================
   POST /api/empresas - OPTIMIZADO
   ======================================================= */
export async function createEmpresa(req, res) {
    try {
        const { nombre, rut, direccion, telefono, email } = req.body;
        // Validar campos obligatorios
        if ((rut || direccion || telefono || email) && (!rut || !direccion || !telefono || !email)) {
            res.status(400).json({
                success: false,
                error: "Si se proporciona detalle de empresa, todos los campos (rut, direccion, telefono, email) son obligatorios"
            });
            return;
        }
        const data = {
            nombre,
        };
        if (rut && direccion && telefono && email) {
            data.detalleEmpresa = {
                create: {
                    rut,
                    direccion,
                    telefono,
                    email
                },
            };
        }
        const nuevaEmpresa = await prisma.empresa.create({
            data,
            select: {
                id_empresa: true,
                nombre: true,
                detalleEmpresa: true
            },
        });
        // ✅ LIMPIAR CACHE
        clearEmpresasCache();
        res.status(201).json({
            success: true,
            data: nuevaEmpresa
        });
    }
    catch (error) {
        console.error("Error al crear empresa:", error);
        if (error.code === "P2002") {
            const field = error.meta?.target?.[0];
            const errorMessage = field === "nombre"
                ? "El nombre de la empresa ya existe"
                : "El RUT de la empresa ya existe";
            res.status(400).json({
                success: false,
                error: errorMessage
            });
            return;
        }
        res.status(500).json({
            success: false,
            error: "Error al crear empresa"
        });
    }
}
/* =======================================================
   PUT /api/empresas/:id - OPTIMIZADO
   ======================================================= */
export async function updateEmpresa(req, res) {
    try {
        const id = Number(req.params.id);
        const { nombre, rut, direccion, telefono, email } = req.body;
        // Validar campos obligatorios
        if ((rut || direccion || telefono || email) && (!rut || !direccion || !telefono || !email)) {
            res.status(400).json({
                success: false,
                error: "Si se proporciona detalle de empresa, todos los campos (rut, direccion, telefono, email) son obligatorios"
            });
            return;
        }
        const empresaExistente = await prisma.empresa.findUnique({
            where: { id_empresa: id },
            select: {
                id_empresa: true,
                detalleEmpresa: true
            },
        });
        if (!empresaExistente) {
            res.status(404).json({
                success: false,
                error: "Empresa no encontrada"
            });
            return;
        }
        const data = {
            nombre,
        };
        // Manejar DetalleEmpresa
        if (rut && direccion && telefono && email) {
            if (empresaExistente.detalleEmpresa) {
                data.detalleEmpresa = {
                    update: {
                        rut,
                        direccion,
                        telefono,
                        email
                    },
                };
            }
            else {
                data.detalleEmpresa = {
                    create: {
                        rut,
                        direccion,
                        telefono,
                        email
                    },
                };
            }
        }
        const empresaActualizada = await prisma.empresa.update({
            where: { id_empresa: id },
            data,
            select: {
                id_empresa: true,
                nombre: true,
                detalleEmpresa: true
            },
        });
        // ✅ LIMPIAR CACHE
        clearEmpresasCache();
        res.json({
            success: true,
            data: empresaActualizada
        });
    }
    catch (error) {
        console.error("Error al actualizar empresa:", error);
        if (error.code === "P2002") {
            const field = error.meta?.target?.[0];
            const errorMessage = field === "nombre"
                ? "El nombre de la empresa ya existe"
                : "El RUT de la empresa ya existe";
            res.status(400).json({
                success: false,
                error: errorMessage
            });
            return;
        }
        res.status(500).json({
            success: false,
            error: "Error al actualizar empresa"
        });
    }
}
/* =======================================================
   DELETE /api/empresas/:id - OPTIMIZADO
   ======================================================= */
export async function deleteEmpresa(req, res) {
    try {
        const id = Number(req.params.id);
        // ✅ CONSULTA OPTIMIZADA CON _count
        const empresaExistente = await prisma.empresa.findUnique({
            where: { id_empresa: id },
            select: {
                id_empresa: true,
                _count: {
                    select: {
                        solicitantes: true,
                        tickets: true,
                        visitas: true,
                        detalleTrabajos: true
                    }
                }
            }
        });
        if (!empresaExistente) {
            res.status(404).json({
                success: false,
                error: "Empresa no encontrada"
            });
            return;
        }
        // Verificar si tiene registros relacionados
        const tieneRelaciones = empresaExistente._count.solicitantes > 0 ||
            empresaExistente._count.tickets > 0 ||
            empresaExistente._count.visitas > 0 ||
            empresaExistente._count.detalleTrabajos > 0;
        if (tieneRelaciones) {
            res.status(400).json({
                success: false,
                error: "No se puede eliminar la empresa porque tiene registros relacionados (solicitantes, tickets, visitas o trabajos)"
            });
            return;
        }
        await prisma.$transaction(async (tx) => {
            // Eliminar DetalleEmpresa si existe
            await tx.detalleEmpresa.deleteMany({
                where: { empresa_id: id }
            });
            // Eliminar la empresa
            await tx.empresa.delete({
                where: { id_empresa: id }
            });
        });
        // ✅ LIMPIAR CACHE
        clearEmpresasCache();
        res.json({
            success: true,
            message: "Empresa eliminada correctamente"
        });
    }
    catch (error) {
        console.error("Error al eliminar empresa:", error);
        if (error.code === "P2003") {
            res.status(400).json({
                success: false,
                error: "No se puede eliminar la empresa porque tiene registros relacionados"
            });
            return;
        }
        res.status(500).json({
            success: false,
            error: "Error al eliminar empresa"
        });
    }
}
// ✅ LIMPIAR CACHE PERIÓDICAMENTE
setInterval(() => {
    clearEmpresasCache();
    console.log('Cache de empresas limpiado');
}, CACHE_TTL * 4);
//# sourceMappingURL=empresas.controller.js.map