import { PrismaClient } from "@prisma/client";
import type { Request, Response } from "express";

const prisma = new PrismaClient();

/* =====================================================
      UTILIDAD: Normalizar fields
===================================================== */
function normalizeCotizacionData(body: any) {
    const out: any = {};

    if (body.tipo) out.tipo = body.tipo;
    if (body.estado) out.estado = body.estado;

    // entidadId siempre number o null
    out.entidadId =
        body.entidadId === "" || body.entidadId === null || body.entidadId === undefined
            ? null
            : Number(body.entidadId);

    // total siempre número
    if (body.total !== undefined) {
        out.total = Number(body.total);
    }

    // fecha segura
    if (body.fecha) {
        out.fecha = new Date(body.fecha);
    }

    return out;
}

/* =====================================================
      GET ALL - ASEGURAR INCLUSIÓN DE ITEMS
===================================================== */
export async function getCotizaciones(req: Request, res: Response) {
    try {
        const rows = await prisma.cotizacionGestioo.findMany({
            orderBy: { id: "desc" },
            include: {
                entidad: true,
                items: { // Asegurar que siempre se incluyan los items
                    orderBy: { id: "asc" }
                },
            },
        });

        // Verificar que cada cotización tenga items array
        const rowsConItems = rows.map(cotizacion => ({
            ...cotizacion,
            items: cotizacion.items || [] // Asegurar array vacío si es null/undefined
        }));

        res.json({ data: rowsConItems });
    } catch (error: any) {
        console.error("❌ Error getCotizaciones:", error);
        res.status(500).json({ error: "Error al obtener cotizaciones" });
    }
}

/* =====================================================
      GET BY ID - ASEGURAR INCLUSIÓN DE ITEMS
===================================================== */
export async function getCotizacionById(req: Request, res: Response) {
    try {
        const id = Number(req.params.id);

        const cot = await prisma.cotizacionGestioo.findUnique({
            where: { id },
            include: {
                entidad: true,
                items: {
                    orderBy: { id: "asc" }
                },
            },
        });

        if (!cot) return res.status(404).json({ error: "Cotización no encontrada" });

        // Asegurar que items sea un array
        const cotConItems = {
            ...cot,
            items: cot.items || []
        };

        res.json({ data: cotConItems });
    } catch (error: any) {
        console.error("❌ Error getCotizacionById:", error);
        res.status(500).json({ error: "Error al obtener cotización" });
    }
}

/* =====================================================
      CREATE
===================================================== */
export async function createCotizacion(req: Request, res: Response) {
    try {
        const { items, ...rest } = req.body;

        if (!items || !Array.isArray(items) || items.length === 0) {
            return res.status(400).json({ error: "La cotización debe tener items" });
        }

        const data = normalizeCotizacionData(rest);

        const nueva = await prisma.cotizacionGestioo.create({
            data: {
                ...data,
                items: {
                    create: items.map((i: any) => ({
                        tipo: i.tipo,
                        descripcion: i.descripcion,
                        cantidad: Number(i.cantidad ?? 1),
                        precio: Number(i.precio ?? 0),
                        porcentaje: i.porcentaje !== undefined ? Number(i.porcentaje) : null,
                    })),
                },
            },
            include: {
                entidad: true,
                items: true,
            },
        });

        res.status(201).json({ data: nueva });
    } catch (error: any) {
        console.error("❌ Error createCotizacion:", error);
        res.status(500).json({ error: "Error al crear cotización" });
    }
}

/* =====================================================
      UPDATE
===================================================== */
/* =====================================================
      UPDATE - MEJORADO CON VALIDACIÓN
===================================================== */
export async function updateCotizacion(req: Request, res: Response) {
    try {
        const id = Number(req.params.id);

        // Validar ID
        if (isNaN(id) || id <= 0) {
            return res.status(400).json({ error: "ID de cotización inválido" });
        }

        const existe = await prisma.cotizacionGestioo.findUnique({
            where: { id }
        });

        if (!existe) {
            return res.status(404).json({ error: "Cotización no encontrada" });
        }

        const { items, ...rest } = req.body;

        // Validar items de forma más específica
        if (!items || !Array.isArray(items)) {
            return res.status(400).json({
                error: "Los items son requeridos y deben ser un array"
            });
        }

        if (items.length === 0) {
            return res.status(400).json({
                error: "La cotización debe tener al menos un item"
            });
        }

        // Validar cada item
        for (const [index, item] of items.entries()) {
            if (!item.descripcion || item.descripcion.trim() === '') {
                return res.status(400).json({
                    error: `El item ${index + 1} debe tener una descripción`
                });
            }
            if (!item.cantidad || item.cantidad <= 0) {
                return res.status(400).json({
                    error: `El item ${index + 1} debe tener una cantidad válida`
                });
            }
            if (item.precio === undefined || item.precio < 0) {
                return res.status(400).json({
                    error: `El item ${index + 1} debe tener un precio válido`
                });
            }
        }

        const data = normalizeCotizacionData(rest);

        // Validar datos normalizados
        if (data.entidadId !== null && (isNaN(data.entidadId) || data.entidadId <= 0)) {
            return res.status(400).json({ error: "EntidadId inválido" });
        }

        if (data.total !== undefined && (isNaN(data.total) || data.total < 0)) {
            return res.status(400).json({ error: "Total inválido" });
        }

        // Usar transacción para mayor seguridad
        const updated = await prisma.$transaction(async (tx) => {
            // Borrar items antiguos
            await tx.cotizacionItemGestioo.deleteMany({
                where: { cotizacionId: id },
            });

            // Actualizar cotización
            return await tx.cotizacionGestioo.update({
                where: { id },
                data: {
                    ...data,
                    items: {
                        create: items.map((i: any) => ({
                            tipo: i.tipo || "PRODUCTO",
                            descripcion: i.descripcion.trim(),
                            cantidad: Number(i.cantidad ?? 1),
                            precio: Number(i.precio ?? 0),
                            porcentaje: i.porcentaje !== undefined ? Number(i.porcentaje) : null,
                        })),
                    },
                },
                include: {
                    entidad: true,
                    items: true,
                },
            });
        });

        res.json({ data: updated });
    } catch (error: any) {
        console.error("❌ Error updateCotizacion:", error);

        // Mensajes de error más específicos
        if (error.code === 'P2025') {
            return res.status(404).json({ error: "Cotización no encontrada" });
        }
        if (error.code === 'P2003') {
            return res.status(400).json({ error: "Entidad no válida" });
        }

        res.status(500).json({
            error: "Error al actualizar cotización",
            details: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
}

/* =====================================================
      DELETE
===================================================== */
export async function deleteCotizacion(req: Request, res: Response) {
    try {
        const id = Number(req.params.id);

        await prisma.cotizacionGestioo.delete({
            where: { id },
        });

        res.json({ message: "Cotización eliminada correctamente" });
    } catch (error: any) {
        console.error("❌ Error deleteCotizacion:", error);
        res.status(500).json({ error: "Error al eliminar cotización" });
    }
}
