import type { Request, Response } from "express";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

/* =====================================================
   CRUD: DETALLETRABAJOGESTIOO
===================================================== */

export async function createDetalleTrabajo(req: Request, res: Response) {
    try {
        const data = req.body;

        const nuevoTrabajo = await prisma.detalleTrabajoGestioo.create({
            data: {
                fecha: data.fecha ? new Date(data.fecha) : new Date(),
                tipoTrabajo: data.tipoTrabajo || "General",
                descripcion: data.descripcion ?? null,
                estado: data.estado ?? "pendiente",
                notas: data.notas ?? null,
                area: data.area ?? "ENTRADA",
                prioridad: data.prioridad ?? "NORMAL",

                entidadId: data.entidadId ?? null,
                productoId: data.productoId ?? null,
                servicioId: data.servicioId ?? null,

                // 👇 **NUEVO**
                equipoId: data.equipoId ?? null,
            },
            include: {
                entidad: true,
                producto: true,
                servicio: true,
                equipo: true, // 👈 PARA DEVOLVERLO DIRECTO
            },
        });

        res.status(201).json(nuevoTrabajo);
    } catch (error) {
        console.error("❌ Error al crear detalle de trabajo:", error);
        res.status(500).json({ error: "Error al crear detalle de trabajo" });
    }
}

// ✅ Obtener todos los trabajos
export async function getDetallesTrabajo(_req: Request, res: Response) {
    try {
        const detalles = await prisma.detalleTrabajoGestioo.findMany({
            orderBy: { id: "asc" },
            include: {
                entidad: true,
                producto: true,
                servicio: true,
                equipo: true,
            },
        });
        res.json(detalles);
    } catch (error) {
        console.error("❌ Error al obtener trabajos:", error);
        res.status(500).json({ error: "Error al obtener trabajos" });
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
            },
        });
        if (!detalle) return res.status(404).json({ error: "Detalle no encontrado" });
        res.json(detalle);
    } catch (error) {
        console.error("❌ Error al obtener detalle:", error);
        res.status(500).json({ error: "Error al obtener detalle de trabajo" });
    }
    return res.status(500).json({        // ✅ RETURN OBLIGATORIO
        error: "Error al obtener trabajo cotización",
    });
}

// ✅ Actualizar trabajo
export async function updateDetalleTrabajo(req: Request, res: Response) {
    try {
        const id = Number(req.params.id);
        const data = req.body;

        // Validar que el registro existe
        const existing = await prisma.detalleTrabajoGestioo.findUnique({
            where: { id }
        });

        if (!existing) {
            return res.status(404).json({ error: "Detalle de trabajo no encontrado" });
        }

        // Solo permitir campos que existen en el modelo
        const updateData: any = {
            tipoTrabajo: data.tipoTrabajo,
            descripcion: data.descripcion ?? null,
            prioridad: data.prioridad,
            estado: data.estado,
            notas: data.notas ?? null,
            area: data.area,
            fecha: data.fecha ? new Date(data.fecha) : existing.fecha,
            entidadId: data.entidadId ? Number(data.entidadId) : null,
            productoId: data.productoId ? Number(data.productoId) : null,
            // servicioId se mantiene como está o se establece en null si no se envía
        };

        // Si servicioId viene en el request, actualizarlo
        if (data.servicioId !== undefined) {
            updateData.servicioId = data.servicioId ? Number(data.servicioId) : null;
        }

        if (data.equipoId !== undefined) {
            updateData.equipoId = data.equipoId ? Number(data.equipoId) : null;
        }

        console.log("📤 Datos para actualizar:", updateData);

        const detalleActualizado = await prisma.detalleTrabajoGestioo.update({
            where: { id },
            data: updateData,
            include: {
                entidad: true,
                producto: true,
                servicio: true,
                equipo: true,
            },
        });

        console.log("✅ Actualización exitosa:", detalleActualizado.id);
        res.json(detalleActualizado);

    } catch (error) {
        console.error("❌ Error al actualizar detalle:", error);
        res.status(500).json({
            error: "Error al actualizar detalle de trabajo",
            details: error instanceof Error ? error.message : "Error desconocido"
        });
    }
    return res.status(500).json({        // ✅ RETURN OBLIGATORIO
        error: "Error al actualizar trabajo",
    });
}

// ✅ Eliminar trabajo
export async function deleteDetalleTrabajo(req: Request, res: Response) {
    try {
        const id = Number(req.params.id);
        await prisma.detalleTrabajoGestioo.delete({ where: { id } });
        res.json({ message: "✅ Detalle de trabajo eliminado correctamente" });
    } catch (error) {
        console.error("❌ Error al eliminar detalle:", error);
        res.status(500).json({ error: "Error al eliminar detalle de trabajo" });
    }
}

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
            },
        });

        return res.json(trabajos);
    } catch (error) {
        console.error("❌ Error al obtener trabajos por equipo:", error);
        return res.status(500).json({ error: "Error al obtener trabajos por equipo" });
    }
}
