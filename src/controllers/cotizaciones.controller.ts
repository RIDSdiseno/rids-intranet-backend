import { PrismaClient } from "@prisma/client";
import type { Request, Response } from "express";

import { EstadoCotizacionGestioo } from "@prisma/client";

const prisma = new PrismaClient();

function generarSKU(): string {
    const random = Math.floor(100000 + Math.random() * 900000); // 6 dígitos
    return `SKU-${random}`;
}

async function generarNumeroOrdenOT(): Promise<string> {
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
      GET PAGINADO - /cotizaciones/paginacion
===================================================== */
export async function getCotizacionesPaginadas(req: Request, res: Response) {
    try {
        const page = Math.max(1, Number(req.query.page) || 1);
        const limitRaw = Number(req.query.limit) || 15;
        const limit = Math.min(Math.max(1, limitRaw), 100);
        const skip = (page - 1) * limit;

        const {
            fechaDesde,
            fechaHasta,
            search,
            estado,
            tipo,
            origen
        } = req.query;

        const AND: any[] = [];

        /* ==========================
           FILTRO POR FECHAS
        ========================== */
        if (fechaDesde || fechaHasta) {
            const fechaFilter: any = {};
            if (fechaDesde) fechaFilter.gte = new Date(String(fechaDesde));
            if (fechaHasta) fechaFilter.lte = new Date(String(fechaHasta));

            AND.push({ fecha: fechaFilter });
        }

        /* ==========================
           FILTRO POR ESTADO
        ========================== */
        if (estado) {
            AND.push({ estado: String(estado) });
        }

        /* ==========================
           FILTRO POR TIPO
        ========================== */
        if (tipo) {
            AND.push({ tipo: String(tipo) });
        }

        /* ==========================
           FILTRO POR ORIGEN
        ========================== */
        if (origen) {
            AND.push({
                entidad: {
                    origen: String(origen)
                }
            });
        }

        /* ==========================
           BUSCADOR GLOBAL
        ========================== */
        if (search) {
            const searchValue = String(search);
            const searchUpper = searchValue.toUpperCase();

            const OR: any[] = [];

            // Buscar por ID si es número
            if (!isNaN(Number(searchValue))) {
                OR.push({ id: Number(searchValue) });
            }

            // Buscar por estado (enum exact match)
            const estadosMatch = Object.values(EstadoCotizacionGestioo).filter(e =>
                e.toLowerCase().includes(searchValue.toLowerCase())
            );

            if (estadosMatch.length > 0) {
                OR.push({
                    estado: { in: estadosMatch }
                });
            }

            // Buscar por nombre entidad (string)
            OR.push({
                entidad: {
                    nombre: {
                        contains: searchValue,
                        mode: "insensitive"
                    }
                }
            });

            AND.push({ OR });
        }

        const where = AND.length > 0 ? { AND } : {};

        /* ==========================
           QUERY PAGINADA
        ========================== */
        const [rows, total] = await Promise.all([
            prisma.cotizacionGestioo.findMany({
                where,
                skip,
                take: limit,
                orderBy: { fecha: "desc" },
                include: {
                    entidad: true,
                    tecnico: {
                        select: { id_tecnico: true, nombre: true }
                    },
                    _count: {
                        select: {
                            items: true,
                            facturas: true
                        }
                    }
                }
            }),
            prisma.cotizacionGestioo.count({ where })
        ]);

        const pages = Math.ceil(total / limit);

        return res.json({
            data: rows,
            total,
            page,
            pages,
            hasNext: page < pages,
            hasPrev: page > 1
        });

    } catch (error: any) {
        console.error("🔥 ERROR REAL:", error);
        return res.status(500).json({
            error: error.message,
            stack: error.stack
        });
    }
}

/* =====================================================
      UTILIDAD: Normalizar fields
===================================================== */
function normalizeCotizacionData(body: any) {
    const out: any = {};

    if (body.tipo) out.tipo = body.tipo;
    if (body.estado) out.estado = body.estado;

    if (body.entidadId !== undefined) {
        out.entidadId =
            body.entidadId === "" || body.entidadId === null
                ? null
                : Number(body.entidadId);
    }

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
export async function getCotizaciones(req: Request, res: Response) {
    try {

        const { fechaDesde, fechaHasta } = req.query;

        const where: any = {};

        if (fechaDesde || fechaHasta) {
            where.fecha = {};

            if (fechaDesde) {
                where.fecha.gte = new Date(String(fechaDesde));
            }

            if (fechaHasta) {
                where.fecha.lte = new Date(String(fechaHasta));
            }
        }

        const rows = await prisma.cotizacionGestioo.findMany({
            where,
            orderBy: { id: "desc" },
            include: {
                entidad: true,
                items: { orderBy: { id: "asc" } },
                tecnico: {
                    select: {
                        id_tecnico: true,
                        nombre: true,
                        email: true,
                    },
                },
                facturas: true,
                trabajos: {
                    select: { id: true, numeroOrden: true }
                }
            },
        });

        res.json({ data: rows });

    } catch (error) {
        console.error(error);
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
                tecnico: {
                    select: {
                        id_tecnico: true,
                        nombre: true,
                        email: true,
                    },
                },
            },
        });

        if (!cot) {
            return res.status(404).json({ error: "Cotización no encontrada" });
        }

        // Asegurar que items sea un array
        const cotConItems = {
            ...cot,
            imagen: cot.imagen ?? null,
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
        const user = (req as any).user;
        const userId = user?.id;

        if (!userId) {
            return res.status(401).json({ error: "No autenticado" });
        }

        const { items, ...rest } = req.body;

        if (!items || !Array.isArray(items) || items.length === 0) {
            return res.status(400).json({ error: "La cotización debe tener items" });
        }

        const data = normalizeCotizacionData(rest);

        const nueva = await prisma.cotizacionGestioo.create({
            data: {
                ...data,
                comentariosCotizacion: req.body.comentariosCotizacion ?? null,
                imagen: req.body.imagen ?? null,
                tecnicoId: userId,

                items: {
                    create: items.map((i: any) => {
                        const precioCLP = Number(
                            i.precioOriginalCLP ?? i.precio ?? 0
                        );

                        return {
                            tipo: i.tipo,

                            // 🔤 TEXTO
                            nombre: i.nombre?.trim() ?? i.descripcion?.trim() ?? "",
                            descripcion:
                                i.descripcion?.trim() && i.descripcion.trim() !== ""
                                    ? i.descripcion.trim()
                                    : "", // <-- Cambiar null por string vacío

                            cantidad: Number(i.cantidad ?? 1),

                            // 🔥 PRECIO REAL (CLP)
                            precio: precioCLP,
                            precioOriginalCLP: precioCLP,

                            // COSTOS
                            precioCosto:
                                i.precioCosto != null ? Number(i.precioCosto) : null,
                            porcGanancia:
                                i.porcGanancia != null ? Number(i.porcGanancia) : null,

                            // DESCUENTOS
                            tieneDescuento: Boolean(i.tieneDescuento),
                            porcentaje: i.tieneDescuento
                                ? Number(i.porcentaje ?? 0)
                                : 0,

                            // IVA
                            tieneIVA: Boolean(i.tieneIVA),

                            // OTROS
                            sku:
                                i.sku && i.sku.trim() !== ""
                                    ? i.sku
                                    : generarSKU(),
                            imagen: i.imagen ?? null,
                        };
                    }),
                },
            },
            include: {
                entidad: true,
                items: true,
                tecnico: {
                    select: {
                        id_tecnico: true,
                        nombre: true,
                        email: true,
                    },
                },
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

        if (isNaN(id) || id <= 0) {
            return res.status(400).json({ error: "ID de cotización inválido" });
        }

        const existe = await prisma.cotizacionGestioo.findUnique({
            where: { id },
        });

        if (!existe) {
            return res.status(404).json({ error: "Cotización no encontrada" });
        }

        const { items, ...rest } = req.body;

        if (items !== undefined) {
            if (!Array.isArray(items) || items.length === 0) {
                return res.status(400).json({ error: "Debe incluir items válidos" });
            }
        }

        const data = normalizeCotizacionData(rest);

        const updated = await prisma.cotizacionGestioo.update({
            where: { id },
            data: {
                ...data,

                ...(req.body.comentariosCotizacion !== undefined && {
                    comentariosCotizacion: req.body.comentariosCotizacion
                }),

                ...(req.body.imagen !== undefined && {
                    imagen: req.body.imagen
                }),

                ...(items !== undefined && {
                    items: {
                        deleteMany: {},
                        create: items.map((i: any) => ({
                            tipo: i.tipo,
                            nombre: i.nombre?.trim() ?? "",
                            descripcion: i.descripcion?.trim() ?? "",
                            cantidad: Number(i.cantidad ?? 1),
                            precio: Number(i.precioOriginalCLP ?? i.precio ?? 0),
                            precioOriginalCLP: Number(i.precioOriginalCLP ?? i.precio ?? 0),
                            precioCosto: i.precioCosto != null ? Number(i.precioCosto) : null,
                            porcGanancia: i.porcGanancia != null ? Number(i.porcGanancia) : null,
                            tieneDescuento: Boolean(i.tieneDescuento),
                            porcentaje: i.tieneDescuento ? Number(i.porcentaje ?? 0) : 0,
                            tieneIVA: Boolean(i.tieneIVA),
                            sku: i.sku?.trim() || generarSKU(),
                            imagen: i.imagen ?? null,
                        })),
                    },
                }),
            },
            include: {
                entidad: true,
                items: true,
                tecnico: {   // 👈 ESTE FALTABA
                    select: {
                        id_tecnico: true,
                        nombre: true,
                        email: true,
                    },
                },
            },
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

        const cotizacion = await prisma.cotizacionGestioo.findUnique({
            where: { id },
            include: { facturas: true },
        });

        if (!cotizacion)
            return res.status(404).json({ error: "Cotización no encontrada" });

        if (cotizacion.facturas.length > 0) {
            return res.status(400).json({
                error: "No se puede eliminar una cotización que ya fue facturada"
            });
        }

        await prisma.cotizacionGestioo.delete({
            where: { id },
        });

        res.json({ message: "Cotización eliminada correctamente" });

    } catch (error: any) {
        console.error("❌ Error deleteCotizacion:", error);
        res.status(500).json({ error: "Error al eliminar cotización" });
    } return
}

export async function facturarCotizacion(req: Request, res: Response) {
    const { id } = req.params;

    try {
        const cotizacion = await prisma.cotizacionGestioo.findUnique({
            where: { id: Number(id) },
        });

        if (!cotizacion)
            return res.status(404).json({ error: "Cotización no encontrada" });

        if (cotizacion.estado !== "APROBADA")
            return res.status(400).json({ error: "Solo se pueden facturar cotizaciones aprobadas" });

        const yaFacturada = await prisma.factura.findFirst({
            where: { cotizacionId: cotizacion.id },
        });

        if (yaFacturada)
            return res.status(400).json({ error: "Esta cotización ya fue facturada" });

        // ==============================
        // 🔥 1️⃣ OBTENER AÑO ACTUAL
        // ==============================
        const year = new Date().getFullYear();

        // ==============================
        // 🔥 2️⃣ BUSCAR ÚLTIMA FACTURA DEL AÑO
        // ==============================
        const ultimaFacturaDelAnio = await prisma.factura.findFirst({
            where: {
                numeroFactura: {
                    startsWith: `F-${year}-`
                }
            },
            orderBy: {
                id_factura: "desc"
            }
        });

        let nuevoNumero = 1;

        if (ultimaFacturaDelAnio) {
            const partes = ultimaFacturaDelAnio.numeroFactura.split("-");
            const numeroActual = Number(partes[2]); // 0001
            nuevoNumero = numeroActual + 1;
        }

        // ==============================
        // 🔥 3️⃣ FORMATEAR 4 DÍGITOS
        // ==============================
        const numeroFormateado = `F-${year}-${String(nuevoNumero).padStart(4, "0")}`;

        // ==============================
        // 🔥 4️⃣ CREAR FACTURA
        // ==============================
        const factura = await prisma.factura.create({
            data: {
                numeroFactura: numeroFormateado,
                total: cotizacion.total,
                cotizacionId: cotizacion.id,
            },
        });

        // ==============================
        // 🔥 5️⃣ CAMBIAR ESTADO COTIZACIÓN
        // ==============================
        await prisma.cotizacionGestioo.update({
            where: { id: cotizacion.id },
            data: { estado: "FACTURADA" },
        });

        res.json({ message: "Facturada correctamente", factura });

    } catch (error) {
        console.error(error);
        res.status(500).json({ error: "Error interno al facturar" });
    } return
}

export async function anularFactura(req: Request, res: Response) {
    const { id } = req.params;

    try {
        const factura = await prisma.factura.findUnique({
            where: { id_factura: Number(id) },
            include: { cotizacion: true }
        });

        if (!factura)
            return res.status(404).json({ error: "Factura no encontrada" });

        if (factura.estado === "ANULADA")
            return res.status(400).json({ error: "La factura ya está anulada" });

        // 🔥 1️⃣ Cambiar estado factura
        await prisma.factura.update({
            where: { id_factura: factura.id_factura },
            data: { estado: "ANULADA" }
        });

        // 🔥 2️⃣ Volver cotización a APROBADA
        await prisma.cotizacionGestioo.update({
            where: { id: factura.cotizacionId },
            data: { estado: "APROBADA" }
        });

        res.json({ message: "Factura anulada correctamente" });

    } catch (error) {
        console.error(error);
        res.status(500).json({ error: "Error al anular factura" });
    } return
}

export async function pagarFactura(req: Request, res: Response) {
    const { id } = req.params;

    try {
        const factura = await prisma.factura.findUnique({
            where: { id_factura: Number(id) },
        });

        if (!factura)
            return res.status(404).json({ error: "Factura no encontrada" });

        if (factura.estado === "PAGADA")
            return res.status(400).json({ error: "La factura ya está pagada" });

        if (factura.estado === "ANULADA")
            return res.status(400).json({ error: "No se puede pagar una factura anulada" });

        await prisma.factura.update({
            where: { id_factura: factura.id_factura },
            data: { estado: "PAGADA" },
        });

        res.json({ message: "Factura marcada como pagada" });

    } catch (error) {
        console.error(error);
        res.status(500).json({ error: "Error al pagar factura" });
    } return
}

export async function generarOrdenDesdeCotizacion(req: Request, res: Response) {
    try {
        const cotizacionId = Number(req.params.id);

        const cotizacion = await prisma.cotizacionGestioo.findUnique({
            where: { id: cotizacionId },
            include: { items: true }
        });

        if (!cotizacion)
            return res.status(404).json({ error: "Cotización no encontrada" });

        if (cotizacion.estado !== "APROBADA")
            return res.status(400).json({ error: "Solo cotizaciones aprobadas pueden generar orden" });

        if (cotizacion.ordenGenerada)
            return res.status(400).json({ error: "Esta cotización ya generó una orden" });

        let numeroOrdenGenerado = "";

        await prisma.$transaction(async (tx) => {

            numeroOrdenGenerado = await generarNumeroOrdenOT();

            const entrada = await tx.detalleTrabajoGestioo.create({
                data: {
                    numeroOrden: numeroOrdenGenerado,
                    origenTrabajo: "DESDE_COTIZACION",
                    cotizacionId: cotizacion.id,
                    tipoTrabajo: "INGRESO DESDE COTIZACIÓN",
                    descripcion: "Orden generada desde cotización aprobada",
                    entidadId: cotizacion.entidadId,
                    estado: "PENDIENTE",
                    area: "ENTRADA"
                }
            });

            await tx.detalleTrabajoGestioo.update({
                where: { id: entrada.id },
                data: { ordenGrupoId: entrada.id }
            });

            for (const item of cotizacion.items) {
                await tx.detalleTrabajoGestioo.create({
                    data: {
                        numeroOrden: numeroOrdenGenerado,
                        ordenGrupoId: entrada.id,
                        origenTrabajo: "DESDE_COTIZACION",
                        cotizacionId: cotizacion.id,
                        tipoTrabajo: item.tipo,
                        descripcion: item.descripcion || item.nombre,
                        entidadId: cotizacion.entidadId,
                        estado: "PENDIENTE",
                        area: "REPARACION"
                    }
                });
            }

            await tx.cotizacionGestioo.update({
                where: { id: cotizacion.id },
                data: { ordenGenerada: true }
            });

        });

        return res.json({
            message: "Orden generada correctamente",
            numeroOrden: numeroOrdenGenerado
        });

    } catch (error) {
        console.error(error);
        return res.status(500).json({ error: "Error al generar orden" });
    }
}
