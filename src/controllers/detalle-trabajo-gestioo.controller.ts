import type { Request, Response } from "express";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

/* =====================================================
   CRUD: DETALLETRABAJOGESTIOO
===================================================== */

// ✅ Crear trabajo
export async function createDetalleTrabajo(req: Request, res: Response) {
    try {
        const data = req.body;

        // 🔐 Validar técnico si viene
        if (data.tecnicoId) {
            const tecnico = await prisma.tecnico.findUnique({
                where: { id_tecnico: Number(data.tecnicoId) },
            });

            if (!tecnico) {
                return res.status(400).json({ error: "Técnico no válido" });
            }
        }

        const fechaTrabajo = data.fecha ? new Date(data.fecha) : new Date();

        // SI ES SALIDA → cerrar órdenes de entrada del mismo equipo
        if (data.area === "SALIDA" && data.equipoId) {
            await prisma.detalleTrabajoGestioo.updateMany({
                where: {
                    equipoId: Number(data.equipoId),
                    area: "ENTRADA",
                    estado: { not: "COMPLETADA" },
                },
                data: {
                    estado: "COMPLETADA",
                },
            });
        }

        // 👉 Crear trabajo
        const nuevoTrabajo = await prisma.detalleTrabajoGestioo.create({
            data: {
                fecha: fechaTrabajo,
                ordenGrupoId: data.ordenGrupoId ?? null,
                fechaIngreso:
                    data.area === "ENTRADA"
                        ? fechaTrabajo
                        : data.fechaIngreso
                            ? new Date(data.fechaIngreso)
                            : null,

                tipoTrabajo: data.tipoTrabajo || "General",
                descripcion: data.descripcion ?? null,
                notas: data.notas ?? null,
                area: data.area ?? "ENTRADA",
                estado:
                    data.area === "SALIDA"
                        ? "COMPLETADA"
                        : data.estado ?? "PENDIENTE",

                prioridad: data.prioridad ?? "NORMAL",
                entidadId: data.entidadId ? Number(data.entidadId) : null,
                productoId: data.productoId ? Number(data.productoId) : null,
                servicioId: data.servicioId ? Number(data.servicioId) : null,
                equipoId: data.equipoId ? Number(data.equipoId) : null,
                tecnicoId: data.tecnicoId ? Number(data.tecnicoId) : null,
                incluyeCargador: data.incluyeCargador ?? false,
            },
        });

        // ✅ SI ES ENTRADA → usar su ID como grupo
        if (nuevoTrabajo.area === "ENTRADA") {
            await prisma.detalleTrabajoGestioo.update({
                where: { id: nuevoTrabajo.id },
                data: { ordenGrupoId: nuevoTrabajo.id },
            });
        }

        // 🔁 Recargar con relaciones
        const trabajoFinal = await prisma.detalleTrabajoGestioo.findUnique({
            where: { id: nuevoTrabajo.id },
            include: {
                entidad: true,
                producto: true,
                servicio: true,
                equipo: true,
                tecnico: {
                    select: {
                        id_tecnico: true,
                        nombre: true,
                        email: true,
                    },
                },
            },
        });

        return res.status(201).json(trabajoFinal);

    } catch (error) {
        console.error("❌ Error al crear detalle de trabajo:", error);
        return res.status(500).json({ error: "Error al crear detalle de trabajo" });
    }
}

// ✅ Obtener todos los trabajos
export async function getDetallesTrabajo(_req: Request, res: Response) {
    try {
        const detalles = await prisma.detalleTrabajoGestioo.findMany({
            orderBy: { fecha: "desc" },
            include: {
                entidad: true,
                producto: true,
                servicio: true,
                equipo: true,
                tecnico: true,
            },
        });

        return res.json(detalles);
    } catch (error) {
        console.error("❌ Error al obtener trabajos:", error);
        return res.status(500).json({ error: "Error al obtener trabajos" });
    }
}

// ✅ Obtener trabajo por ID
export async function getDetalleTrabajoById(req: Request, res: Response) {
    try {
        const id = Number(req.params.id);

        const detalle = await prisma.detalleTrabajoGestioo.findUnique({
            where: { id },
            include: {
                entidad: true,
                producto: true,
                servicio: true,
                equipo: true,
                tecnico: true,
            },
        });

        if (!detalle) {
            return res.status(404).json({ error: "Detalle de trabajo no encontrado" });
        }

        return res.json(detalle);
    } catch (error) {
        console.error("❌ Error al obtener detalle:", error);
        return res.status(500).json({ error: "Error al obtener detalle de trabajo" });
    }
}

// ✅ Actualizar trabajo
export async function updateDetalleTrabajo(req: Request, res: Response) {
    try {
        const id = Number(req.params.id);
        const data = req.body;

        const existing = await prisma.detalleTrabajoGestioo.findUnique({
            where: { id },
        });

        if (!existing) {
            return res.status(404).json({ error: "Detalle de trabajo no encontrado" });
        }

        // 🔐 Validar técnico si viene
        if (data.tecnicoId !== undefined && data.tecnicoId !== null) {
            const tecnico = await prisma.tecnico.findUnique({
                where: { id_tecnico: Number(data.tecnicoId) },
            });

            if (!tecnico) {
                return res.status(400).json({ error: "Técnico no válido" });
            }
        }

        // 🔥 Si se está cambiando a SALIDA → cerrar entradas previas
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

        const updateData: any = {
            tipoTrabajo: data.tipoTrabajo,
            descripcion: data.descripcion ?? null,
            estado:
                data.area === "SALIDA"
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

        const detalleActualizado = await prisma.detalleTrabajoGestioo.update({
            where: { id },
            data: updateData,
            include: {
                entidad: true,
                producto: true,
                servicio: true,
                equipo: true,
                tecnico: true,
            },
        });

        return res.json(detalleActualizado);
    } catch (error) {
        console.error("❌ Error al actualizar detalle:", error);
        return res.status(500).json({
            error: "Error al actualizar detalle de trabajo",
        });
    }
}

// ✅ Eliminar trabajo
export async function deleteDetalleTrabajo(req: Request, res: Response) {
    try {
        const id = Number(req.params.id);

        await prisma.detalleTrabajoGestioo.delete({
            where: { id },
        });

        return res.json({
            success: true,
            message: "Detalle de trabajo eliminado correctamente",
        });
    } catch (error) {
        console.error("❌ Error al eliminar detalle:", error);
        return res.status(500).json({ error: "Error al eliminar detalle de trabajo" });
    }
}

// ✅ Obtener trabajos por equipo
export async function getDetallesTrabajoByEquipo(req: Request, res: Response) {
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
    } catch (error) {
        console.error("❌ Error al obtener trabajos por equipo:", error);
        return res.status(500).json({ error: "Error al obtener trabajos por equipo" });
    }
}

// ✅ Obtener trabajos por técnico
export async function getDetallesTrabajoByTecnico(req: Request, res: Response) {
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
    } catch (error) {
        console.error("❌ Error al obtener trabajos por técnico:", error);
        return res.status(500).json({ error: "Error al obtener trabajos por técnico" });
    }
}
