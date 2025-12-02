import { PrismaClient } from "@prisma/client";
import type { Request, Response } from "express";

const prisma = new PrismaClient();

function generarSKU(): string {
    const random = Math.floor(100000 + Math.random() * 900000); // 6 dígitos
    return `SKU-${random}`;
}

/* =====================================================
      UTILIDAD: Normalizar fields
===================================================== */
function normalizeCotizacionData(body: any) {
    const out: any = {};

    if (body.tipo) out.tipo = body.tipo;
    if (body.estado) out.estado = body.estado;

    out.entidadId =
        body.entidadId === "" || body.entidadId === null || body.entidadId === undefined
            ? null
            : Number(body.entidadId);

    // nuevos campos
    if (body.subtotal !== undefined) out.subtotal = Number(body.subtotal);
    if (body.descuentos !== undefined) out.descuentos = Number(body.descuentos);
    if (body.iva !== undefined) out.iva = Number(body.iva);
    if (body.total !== undefined) out.total = Number(body.total);

    if (body.moneda) out.moneda = body.moneda;

    // <--- CORRECCIÓN FINAL
    if (body.tasaCambio !== undefined)
        out.tasaCambio = Number(body.tasaCambio);

    if (body.fecha) out.fecha = new Date(body.fecha);

    if (body.comentariosCotizacion !== undefined)
        out.comentariosCotizacion = body.comentariosCotizacion;

    return out;
}

/* =====================================================
      GET ALL - ASEGURAR INCLUSIÓN DE ITEMS
===================================================== */
export async function getCotizaciones(_req: Request, res: Response) {
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

        if (!cot) {
            return res.status(404).json({ error: "Cotización no encontrada" });
        }

        // Asegurar que items sea un array
        const cotConItems = {
            ...cot,
            items: cot.items || []
        };

        return res.json({ data: cotConItems });  // ← RETURN agregado
    } catch (error: any) {
        console.error("❌ Error getCotizacionById:", error);
        return res.status(500).json({ error: "Error al obtener cotización" }); // ← RETURN agregado
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
                comentariosCotizacion: req.body.comentariosCotizacion ?? null,
                items: {
                    create: items.map((i: any) => ({
                        tipo: i.tipo,
                        descripcion: i.descripcion,
                        cantidad: Number(i.cantidad ?? 1),
                        precio: Number(i.precio ?? 0),
                        porcentaje: i.tieneDescuento ? Number(i.porcentaje ?? 0) : 0,
                        tieneDescuento: Boolean(i.tieneDescuento),
                        tieneIVA: i.tieneIVA ?? false,
                        sku: i.sku && i.sku.trim() !== "" ? i.sku : generarSKU(),
                    })),
                },
            },
            include: {
                entidad: true,
                items: true,
            },
        });

        return res.status(201).json({ data: nueva });
    } catch (error: any) {
        console.error("❌ Error createCotizacion:", error);
        return res.status(500).json({ error: "Error al crear cotización" });
    }
}

/* =====================================================
      UPDATE
===================================================== */
export async function updateCotizacion(req: Request, res: Response) {
    try {
        const id = Number(req.params.id);

        if (isNaN(id) || id <= 0)
            return res.status(400).json({ error: "ID de cotización inválido" });

        const existe = await prisma.cotizacionGestioo.findUnique({ where: { id } });
        if (!existe)
            return res.status(404).json({ error: "Cotización no encontrada" });

        const { items, ...rest } = req.body;

        if (!items || !Array.isArray(items) || items.length === 0)
            return res.status(400).json({ error: "Debe incluir items" });

        const data = normalizeCotizacionData(rest);

        const updated = await prisma.$transaction(async (tx) => {
            await tx.cotizacionItemGestioo.deleteMany({ where: { cotizacionId: id } });

            return await tx.cotizacionGestioo.update({
                where: { id },
                data: {
                    ...data,
                    comentariosCotizacion: req.body.comentariosCotizacion ?? null,
                    items: {
                        create: items.map((i: any) => ({
                            tipo: i.tipo,
                            descripcion: i.descripcion.trim(),
                            cantidad: Number(i.cantidad ?? 1),
                            precio: Number(i.precio ?? 0),
                            porcentaje: i.tieneDescuento ? Number(i.porcentaje ?? 0) : 0,
                            tieneDescuento: Boolean(i.tieneDescuento),
                            tieneIVA: i.tieneIVA ?? false,
                            sku: i.sku && i.sku.trim() !== "" ? i.sku : generarSKU(),
                        }))
                    }
                },
                include: {
                    entidad: true,
                    items: true,
                },
            });
        });

        return res.json({ data: updated });

    } catch (error: any) {
        console.error("❌ Error updateCotizacion:", error);
        return res.status(500).json({ error: "Error al actualizar cotización" });
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
