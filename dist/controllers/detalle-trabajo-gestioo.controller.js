import { PrismaClient, EstadoEquipo } from "@prisma/client";
const prisma = new PrismaClient();
const ESTADOS_EQUIPO_VALIDOS = Object.values(EstadoEquipo);
function estadoEquipoPorArea(area) {
    if (area === "ENTRADA")
        return EstadoEquipo.EN_TALLER;
    if (area === "REPARACION")
        return EstadoEquipo.EN_TALLER;
    if (area === "SALIDA")
        return EstadoEquipo.ACTIVO;
    return null;
}
// Función para generar número de orden único por año, con formato "OT-YYYY-XXXX", donde XXXX es un contador secuencial que se reinicia cada año. Consulta la última orden creada para el año actual y genera el siguiente número en secuencia.
async function generarNumeroOrdenOT() {
    const year = new Date().getFullYear();
    const ultimaOrden = await prisma.detalleTrabajoGestioo.findFirst({
        where: {
            numeroOrden: {
                startsWith: `OT-${year}-`
            }
        },
        orderBy: {
            id: "desc"
        }
    });
    let nuevoNumero = 1;
    if (ultimaOrden?.numeroOrden) {
        const partes = ultimaOrden.numeroOrden.split("-");
        const numeroActual = Number(partes[2]);
        nuevoNumero = numeroActual + 1;
    }
    return `OT-${year}-${String(nuevoNumero).padStart(4, "0")}`;
}
/* =====================================================
   CRUD: DETALLETRABAJOGESTIOO
===================================================== */
// Crear trabajo
export async function createDetalleTrabajo(req, res) {
    try {
        const data = req.body;
        if (data.tecnicoId) {
            const tecnico = await prisma.tecnico.findUnique({
                where: { id_tecnico: Number(data.tecnicoId) },
            });
            if (!tecnico) {
                return res.status(400).json({ error: "Técnico no válido" });
            }
        }
        let numeroOrden = null;
        if (data.area === "ENTRADA") {
            numeroOrden = await generarNumeroOrdenOT();
        }
        const fechaTrabajo = data.fecha ? new Date(data.fecha) : new Date();
        // Resolver numeroOrden para areas distintas de ENTRADA
        if (data.area !== "ENTRADA" && data.ordenGrupoId) {
            const ordenGrupo = await prisma.detalleTrabajoGestioo.findUnique({
                where: { id: Number(data.ordenGrupoId) },
                select: { numeroOrden: true },
            });
            numeroOrden = ordenGrupo?.numeroOrden ?? null;
        }
        const equipoIdFinal = data.equipoId ? Number(data.equipoId) : null;
        const estadoEquipoSolicitado = data.estadoEquipo && ESTADOS_EQUIPO_VALIDOS.includes(data.estadoEquipo)
            ? data.estadoEquipo
            : null;
        if (data.estadoEquipo && !estadoEquipoSolicitado) {
            return res.status(400).json({ error: "Estado de equipo no válido" });
        }
        // Si viene estadoEquipo del frontend usarlo, si no calcular por área
        const estadoEquipoFinal = estadoEquipoSolicitado ?? estadoEquipoPorArea(data.area);
        const trabajoFinal = await prisma.$transaction(async (tx) => {
            // Cerrar entradas previas si es SALIDA — solo una vez, dentro de la transacción
            if (data.area === "SALIDA" && equipoIdFinal) {
                await tx.detalleTrabajoGestioo.updateMany({
                    where: {
                        equipoId: equipoIdFinal,
                        area: "ENTRADA",
                        estado: { not: "COMPLETADA" },
                    },
                    data: { estado: "COMPLETADA" },
                });
            }
            const nuevoTrabajo = await tx.detalleTrabajoGestioo.create({
                data: {
                    fecha: fechaTrabajo,
                    numeroOrden,
                    ordenGrupoId: data.ordenGrupoId ?? null,
                    fechaIngreso: data.area === "ENTRADA"
                        ? fechaTrabajo
                        : data.fechaIngreso
                            ? new Date(data.fechaIngreso)
                            : null,
                    tipoTrabajo: data.tipoTrabajo || "General",
                    descripcion: data.descripcion ?? null,
                    notas: data.notas ?? null,
                    area: data.area ?? "ENTRADA",
                    estado: data.area === "SALIDA"
                        ? "COMPLETADA"
                        : data.estado ?? "PENDIENTE",
                    prioridad: data.prioridad ?? "NORMAL",
                    entidadId: data.entidadId ? Number(data.entidadId) : null,
                    productoId: data.productoId ? Number(data.productoId) : null,
                    servicioId: data.servicioId ? Number(data.servicioId) : null,
                    equipoId: equipoIdFinal,
                    tecnicoId: data.tecnicoId ? Number(data.tecnicoId) : null,
                    incluyeCargador: data.incluyeCargador ?? false,
                },
            });
            // Autoasignar ordenGrupoId para órdenes de ENTRADA
            if (nuevoTrabajo.area === "ENTRADA") {
                await tx.detalleTrabajoGestioo.update({
                    where: { id: nuevoTrabajo.id },
                    data: { ordenGrupoId: nuevoTrabajo.id },
                });
            }
            // Actualizar estado del equipo
            if (equipoIdFinal && estadoEquipoFinal) {
                await tx.equipo.update({
                    where: { id_equipo: equipoIdFinal },
                    data: { estado: estadoEquipoFinal },
                });
            }
            return tx.detalleTrabajoGestioo.findUnique({
                where: { id: nuevoTrabajo.id },
                include: {
                    entidad: true,
                    producto: true,
                    servicio: true,
                    equipo: { include: { solicitante: true } },
                    tecnico: {
                        select: { id_tecnico: true, nombre: true, email: true },
                    },
                },
            });
        });
        return res.status(201).json(trabajoFinal);
    }
    catch (error) {
        console.error("❌ Error al crear detalle de trabajo:", error);
        return res.status(500).json({ error: "Error al crear detalle de trabajo" });
    }
}
export async function getDetallesTrabajo(req, res) {
    try {
        const user = req.user;
        const isCliente = user?.rol === "CLIENTE";
        if (isCliente && !user.empresaId) {
            return res.status(403).json({ error: "Tu cuenta no tiene empresa asociada" });
        }
        const where = isCliente
            ? { entidad: { empresaId: user.empresaId } }
            : {};
        const detalles = await prisma.detalleTrabajoGestioo.findMany({
            where,
            orderBy: { fecha: "desc" },
            include: {
                entidad: true,
                equipo: { include: { solicitante: true } },
                tecnico: isCliente
                    ? false
                    : { select: { id_tecnico: true, nombre: true } },
                cotizacion: { select: { id: true, estado: true } },
            },
        });
        return res.json(detalles);
    }
    catch (error) {
        console.error("❌ Error al obtener órdenes:", error);
        return res.status(500).json({ error: "Error al obtener órdenes" });
    }
}
export async function getDetalleTrabajoById(req, res) {
    try {
        const id = Number(req.params.id);
        const user = req.user;
        const detalle = await prisma.detalleTrabajoGestioo.findUnique({
            where: { id },
            include: {
                entidad: true,
                producto: true,
                servicio: true,
                equipo: { include: { solicitante: true } },
                tecnico: true,
            },
        });
        if (!detalle) {
            return res.status(404).json({ error: "Detalle de trabajo no encontrado" });
        }
        // Verificar pertenencia para CLIENTE
        if (user?.rol === "CLIENTE") {
            if (!user.empresaId) {
                return res.status(403).json({ error: "Tu cuenta no tiene empresa asociada" });
            }
            // La entidad debe pertenecer a la empresa del cliente
            if (detalle.entidad?.empresaId !== user.empresaId) {
                return res.status(403).json({ error: "No autorizado" });
            }
        }
        return res.json(detalle);
    }
    catch (error) {
        console.error("❌ Error al obtener detalle:", error);
        return res.status(500).json({ error: "Error al obtener detalle de trabajo" });
    }
}
// Actualizar trabajo
export async function updateDetalleTrabajo(req, res) {
    try {
        const id = Number(req.params.id);
        const data = req.body;
        const existing = await prisma.detalleTrabajoGestioo.findUnique({
            where: { id },
        });
        if (!existing) {
            return res.status(404).json({ error: "Detalle de trabajo no encontrado" });
        }
        // Validar técnico si viene
        if (data.tecnicoId !== undefined && data.tecnicoId !== null) {
            const tecnico = await prisma.tecnico.findUnique({
                where: { id_tecnico: Number(data.tecnicoId) },
            });
            if (!tecnico) {
                return res.status(400).json({ error: "Técnico no válido" });
            }
        }
        // Si se está cambiando a SALIDA → cerrar entradas previas
        if (data.area === "SALIDA" && existing.area !== "SALIDA" && existing.equipoId) {
            await prisma.detalleTrabajoGestioo.updateMany({
                where: {
                    equipoId: existing.equipoId,
                    area: "ENTRADA",
                    estado: { not: "COMPLETADA" },
                },
                data: {
                    estado: "COMPLETADA",
                },
            });
        }
        // Si se está cambiando a ENTRADA sin número de orden → generar número de orden
        const updateData = {
            tipoTrabajo: data.tipoTrabajo,
            descripcion: data.descripcion ?? null,
            estado: data.area === "SALIDA"
                ? "COMPLETADA"
                : data.estado ?? existing.estado,
            prioridad: data.prioridad,
            notas: data.notas ?? null,
            area: data.area,
            fecha: data.fecha ? new Date(data.fecha) : existing.fecha,
            ordenGrupoId: existing.ordenGrupoId,
        };
        if (data.entidadId !== undefined) {
            updateData.entidadId = data.entidadId ? Number(data.entidadId) : null;
        }
        if (data.productoId !== undefined) {
            updateData.productoId = data.productoId ? Number(data.productoId) : null;
        }
        if (data.servicioId !== undefined) {
            updateData.servicioId = data.servicioId ? Number(data.servicioId) : null;
        }
        if (data.equipoId !== undefined) {
            updateData.equipoId = data.equipoId ? Number(data.equipoId) : null;
        }
        if (data.tecnicoId !== undefined) {
            updateData.tecnicoId = data.tecnicoId ? Number(data.tecnicoId) : null;
        }
        if (data.incluyeCargador !== undefined) {
            updateData.incluyeCargador = Boolean(data.incluyeCargador);
        }
        const equipoIdFinal = data.equipoId !== undefined
            ? data.equipoId
                ? Number(data.equipoId)
                : null
            : existing.equipoId;
        const estadoEquipoSolicitado = data.estadoEquipo && ESTADOS_EQUIPO_VALIDOS.includes(data.estadoEquipo)
            ? data.estadoEquipo
            : null;
        if (data.estadoEquipo && !estadoEquipoSolicitado) {
            return res.status(400).json({
                error: "Estado de equipo no válido",
            });
        }
        const estadoEquipoFinal = estadoEquipoSolicitado ?? estadoEquipoPorArea(data.area);
        const detalleActualizado = await prisma.$transaction(async (tx) => {
            if (data.area === "SALIDA" && existing.area !== "SALIDA" && existing.equipoId) {
                await tx.detalleTrabajoGestioo.updateMany({
                    where: {
                        equipoId: existing.equipoId,
                        area: "ENTRADA",
                        estado: { not: "COMPLETADA" },
                    },
                    data: {
                        estado: "COMPLETADA",
                    },
                });
            }
            const detalle = await tx.detalleTrabajoGestioo.update({
                where: { id },
                data: updateData,
                include: {
                    entidad: true,
                    producto: true,
                    servicio: true,
                    equipo: {
                        include: {
                            solicitante: true,
                        },
                    },
                    tecnico: true,
                },
            });
            if (equipoIdFinal && estadoEquipoFinal) {
                await tx.equipo.update({
                    where: {
                        id_equipo: equipoIdFinal,
                    },
                    data: {
                        estado: estadoEquipoFinal,
                    },
                });
            }
            return detalle;
        });
        return res.json(detalleActualizado);
        return res.json(detalleActualizado);
    }
    catch (error) {
        console.error("❌ Error al actualizar detalle:", error);
        return res.status(500).json({
            error: "Error al actualizar detalle de trabajo",
        });
    }
}
// Eliminar trabajo
export async function deleteDetalleTrabajo(req, res) {
    try {
        const id = Number(req.params.id);
        await prisma.detalleTrabajoGestioo.delete({
            where: { id },
        });
        return res.json({
            success: true,
            message: "Detalle de trabajo eliminado correctamente",
        });
    }
    catch (error) {
        console.error("❌ Error al eliminar detalle:", error);
        return res.status(500).json({ error: "Error al eliminar detalle de trabajo" });
    }
}
// Obtener trabajos por equipo
export async function getDetallesTrabajoByEquipo(req, res) {
    try {
        const equipoId = Number(req.params.equipoId);
        const trabajos = await prisma.detalleTrabajoGestioo.findMany({
            where: { equipoId },
            orderBy: { fecha: "desc" },
            include: {
                entidad: true,
                producto: true,
                servicio: true,
                equipo: true,
                tecnico: true,
            },
        });
        return res.json(trabajos);
    }
    catch (error) {
        console.error("❌ Error al obtener trabajos por equipo:", error);
        return res.status(500).json({ error: "Error al obtener trabajos por equipo" });
    }
}
// Obtener trabajos por técnico
export async function getDetallesTrabajoByTecnico(req, res) {
    try {
        const tecnicoId = Number(req.params.tecnicoId);
        const trabajos = await prisma.detalleTrabajoGestioo.findMany({
            where: { tecnicoId },
            orderBy: { fecha: "desc" },
            include: {
                entidad: true,
                producto: true,
                servicio: true,
                equipo: true,
            },
        });
        return res.json(trabajos);
    }
    catch (error) {
        console.error("❌ Error al obtener trabajos por técnico:", error);
        return res.status(500).json({ error: "Error al obtener trabajos por técnico" });
    }
}
// Generar cotización desde orden
export async function generarCotizacionDesdeOrden(req, res) {
    try {
        const numeroOrden = req.params.numeroOrden;
        if (!numeroOrden) {
            return res.status(400).json({ error: "numeroOrden es requerido" });
        }
        // 1️⃣ Traer todos los trabajos de la orden
        const trabajos = await prisma.detalleTrabajoGestioo.findMany({
            where: { numeroOrden },
        });
        if (trabajos.length === 0) {
            return res.status(404).json({ error: "Orden no encontrada" });
        }
        // 2️⃣ Filtrar trabajos que aún no estén vinculados a cotización
        const trabajosPendientes = trabajos.filter(t => !t.cotizacionId);
        if (trabajosPendientes.length === 0) {
            return res.status(400).json({
                error: "Todos los trabajos de esta orden ya están cotizados"
            });
        }
        const entidadId = trabajos[0]?.entidadId ?? null;
        // 3️⃣ Crear cotización
        const nuevaCotizacion = await prisma.cotizacionGestioo.create({
            data: {
                entidadId,
                estado: "BORRADOR",
                ordenGenerada: false,
                items: {
                    create: trabajosPendientes.map(t => ({
                        tipo: t.productoId
                            ? "PRODUCTO"
                            : t.servicioId
                                ? "SERVICIO"
                                : "ADICIONAL",
                        nombre: t.descripcion ?? "Trabajo técnico",
                        descripcion: t.descripcion ?? "",
                        cantidad: 1,
                        precio: 0,
                        precioOriginalCLP: 0,
                        tieneIVA: true,
                        tieneDescuento: false,
                        porcentaje: 0,
                        sku: null
                    }))
                }
            }
        });
        // 4️⃣ Vincular trabajos a la cotización creada
        await prisma.detalleTrabajoGestioo.updateMany({
            where: {
                numeroOrden,
                cotizacionId: null
            },
            data: {
                cotizacionId: nuevaCotizacion.id,
                origenTrabajo: "DESDE_COTIZACION"
            }
        });
        return res.json({
            message: "Cotización creada correctamente",
            cotizacionId: nuevaCotizacion.id
        });
    }
    catch (error) {
        console.error("❌ Error al generar cotización:", error);
        return res.status(500).json({ error: "Error al generar cotización" });
    }
}
//# sourceMappingURL=detalle-trabajo-gestioo.controller.js.map