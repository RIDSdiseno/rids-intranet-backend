// src/controllers/controllers-cotizaciones/cotizaciones.controller.ts
// Controlador para manejo de cotizaciones, con funciones para obtener cotizaciones paginadas con filtros avanzados, crear, actualizar y eliminar cotizaciones, vincular equipos a items, facturar cotizaciones y gestionar estados de facturas. Utiliza Prisma para acceso a base de datos y tiene lógica robusta para validación y manejo de errores.
import type { Request, Response } from "express";

import { EstadoCotizacionGestioo, EstadoDTE } from "@prisma/client";
import { prismaBase as prisma } from "../../lib/prisma.js";
import { sincronizarOportunidadPorCotizacionAprobada } from "../../service/oportunidades/oportunidades.service.js";

import {
    calcularTotalesCotizacionBackend,
    normalizarCantidad,
    normalizarDescuento,
    normalizarGanancia,
    parseDecimalInput,
    redondearDinero,
} from "./cotizaciones-numeros.js";

// UTILIDADES
export function generarSKU(): string {
    const random = Math.floor(100000 + Math.random() * 900000); // 6 dígitos
    return `SKU-${random}`;
}

/* =====================================================
      SECCIONES DE COTIZACIÓN
   El frontend envía `secciones: [{ id, nombre, descripcion }]`
   y cada ítem con `seccionId` = el `id` de su sección.
   - En CREATE todos los ids son temporales.
   - En UPDATE, un id que ya existe en la cotización se actualiza;
     cualquier otro se crea. Las que no vienen se eliminan
     (sus ítems quedan sin sección).
   - Ítems sin sección (seccionId null) = cotizaciones antiguas:
     se muestran sin título.
===================================================== */
const ORDEN_SECCIONES = [{ orden: "asc" as const }, { id: "asc" as const }];

interface SeccionPayload {
    clave: number | null;
    nombre: string;
    descripcion: string | null;
    orden: number;
}

function parseSecciones(raw: unknown): SeccionPayload[] | undefined {
    if (!Array.isArray(raw)) return undefined;

    return raw.map((s: any, idx: number) => {
        const clave = Number(s?.id);
        const nombre = String(s?.nombre ?? "").trim().slice(0, 150);
        const descripcion = String(s?.descripcion ?? "").trim().slice(0, 1000);

        return {
            clave: s?.id !== undefined && s?.id !== null && Number.isFinite(clave) ? clave : null,
            nombre: nombre || `Sección ${idx + 1}`,
            descripcion: descripcion || null,
            orden: idx,
        };
    });
}

/** Traduce el seccionId que mandó el frontend al id real de la BD (o null). */
function resolverSeccionId(raw: unknown, mapa: Map<number, number>): number | null {
    if (raw === undefined || raw === null || raw === "") return null;
    const n = Number(raw);
    if (!Number.isFinite(n)) return null;
    return mapa.get(n) ?? null;
}

function mapEstadoSimpleAPIToEnum(estado: string): EstadoDTE {
    const normalized = estado.toUpperCase();

    switch (normalized) {
        case "ACEPTADO":
        case "APROBADO":
            return EstadoDTE.ACEPTADO;

        case "RECHAZADO":
            return EstadoDTE.RECHAZADO;

        case "OBSERVADO":
            return EstadoDTE.OBSERVADO;

        case "ANULADO":
            return EstadoDTE.ANULADO;

        case "EMITIDO":
        case "ENVIADO":
            return EstadoDTE.EMITIDO;

        default:
            return EstadoDTE.EMITIDO; // fallback seguro
    }
}

/* =====================================================
      GET PAGINADO - /cotizaciones/paginacion
===================================================== */
export async function getCotizacionesPaginadas(req: Request, res: Response) {
    try {
        const user = (req as any).user;
        const isCliente = user?.rol === "CLIENTE";

        if (isCliente && !user.empresaId) {
            return res.status(403).json({ error: "Tu cuenta no tiene empresa asociada" });
        }

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
            origen,
            tecnico
        } = req.query;

        const AND: any[] = [];

        if (isCliente) {
            // Filtro directo — sin queries extra
            AND.push({ entidad: { empresaId: user.empresaId } });
        } else {
            // Filtros internos opcionales
            const { fechaDesde, fechaHasta, estado, tipo, origen, tecnico } = req.query;

            if (fechaDesde || fechaHasta) {
                const fechaFilter: any = {};
                if (fechaDesde) fechaFilter.gte = new Date(String(fechaDesde));
                if (fechaHasta) fechaFilter.lte = new Date(String(fechaHasta));
                AND.push({ fecha: fechaFilter });
            }
            if (estado) AND.push({ estado: String(estado) });
            if (tipo) AND.push({ tipo: String(tipo) });
            if (origen) AND.push({ entidad: { origen: String(origen) } });
            if (tecnico) AND.push({ tecnicoId: Number(tecnico) });
        }

        /* ==========================
           FILTRO POR FECHAS
        ========================== */
        if (isCliente && (fechaDesde || fechaHasta)) {
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
            FILTRO POR TÉCNICO 
         ========================== */
        if (tecnico) {
            AND.push({
                tecnicoId: Number(tecnico)
            });
        }

        /* ==========================
           BUSCADOR GLOBAL
        ========================== */
        if (search) {
            const searchValue = String(search);

            const OR: any[] = [];

            if (!isNaN(Number(searchValue))) {
                OR.push({ id: Number(searchValue) });
            }

            const estadosMatch = Object.values(EstadoCotizacionGestioo).filter(e =>
                e.toLowerCase().includes(searchValue.toLowerCase())
            );

            if (estadosMatch.length > 0) {
                OR.push({
                    estado: { in: estadosMatch }
                });
            }

            OR.push(
                {
                    entidad: {
                        nombre: { contains: searchValue, mode: "insensitive" }
                    }
                },
                {
                    entidad: {
                        rut: { contains: searchValue, mode: "insensitive" }
                    }
                },
                {
                    comentariosCotizacion: {
                        contains: searchValue,
                        mode: "insensitive"
                    }
                },
                {
                    items: {
                        some: { nombre: { contains: searchValue, mode: "insensitive" } }
                    }
                },
                {
                    items: {
                        some: { sku: { contains: searchValue, mode: "insensitive" } }
                    }
                },
                // Búsqueda por técnico solo para roles internos
                ...(!isCliente ? [{
                    tecnico: {
                        nombre: { contains: searchValue, mode: "insensitive" }
                    }
                }] : [])
            );

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
                    tecnico: isCliente
                        ? false
                        : { select: { id_tecnico: true, nombre: true } },
                    items: {
                        orderBy: { id: "asc" },
                        include: {
                            equipo: {
                                select: { id_equipo: true, serial: true, marca: true, modelo: true },
                            },
                        },
                    },
                    facturas: {
                        select: {
                            id_factura: true, folioSII: true, tipoDTE: true,
                            numeroFactura: true, estado: true, fechaEmision: true, total: true,
                        },
                    },
                    _count: { select: { items: true, facturas: true } },
                    secciones: { orderBy: ORDEN_SECCIONES },
                },
            }),
            prisma.cotizacionGestioo.count({ where }),
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
        console.error(" ERROR REAL:", error);
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
    if (body.subtotal !== undefined) {
        out.subtotal = redondearDinero(
            parseDecimalInput(
                body.subtotal,
                0
            )
        );
    }

    if (body.descuentos !== undefined) {
        out.descuentos = redondearDinero(
            parseDecimalInput(
                body.descuentos,
                0
            )
        );
    }

    if (body.iva !== undefined) {
        out.iva = redondearDinero(
            parseDecimalInput(
                body.iva,
                0
            )
        );
    }

    if (body.total !== undefined) {
        out.total = redondearDinero(
            parseDecimalInput(
                body.total,
                0
            )
        );
    }

    if (body.moneda) out.moneda = body.moneda;

    // <--- CORRECCIÓN FINAL
    if (body.tasaCambio !== undefined) {
        out.tasaCambio = redondearDinero(
            parseDecimalInput(
                body.tasaCambio,
                1
            )
        );
    }

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
                secciones: { orderBy: ORDEN_SECCIONES },
                items: {
                    orderBy: { id: "asc" },
                    include: {
                        equipo: {
                            select: {
                                id_equipo: true,
                                serial: true,
                                marca: true,
                                modelo: true,
                            },
                        },
                    },
                },
                tecnico: {
                    select: {
                        id_tecnico: true,
                        nombre: true,
                        email: true,
                    },
                },
                facturas: true,
                trabajos: {
                    select: { id: true, numeroOrden: true },
                },
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
        const user = (req as any).user;

        const cot = await prisma.cotizacionGestioo.findUnique({
            where: { id },
            include: {
                entidad: true,
                secciones: { orderBy: ORDEN_SECCIONES },
                items: {
                    orderBy: { id: "asc" },
                    include: {
                        equipo: {
                            select: { id_equipo: true, serial: true, marca: true, modelo: true },
                        },
                    },
                },
                tecnico: { select: { id_tecnico: true, nombre: true, email: true } },
            },
        });

        if (!cot) {
            return res.status(404).json({ error: "Cotización no encontrada" });
        }

        if (user?.rol === "CLIENTE") {
            if (!user.empresaId) {
                return res.status(403).json({ error: "Tu cuenta no tiene empresa asociada" });
            }
            if (cot.entidad?.empresaId !== user.empresaId) {
                return res.status(403).json({ error: "No autorizado" });
            }
        }

        return res.json({ data: { ...cot, imagen: cot.imagen ?? null, items: cot.items || [] } });
    } catch (error: any) {
        console.error("❌ Error getCotizacionById:", error);
        return res.status(500).json({ error: "Error al obtener cotización" });
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

        /*
 * El backend vuelve a calcular todos los totales.
 * Los valores enviados por el frontend no se
 * consideran la fuente definitiva.
 */
        const totalesCalculados =
            calcularTotalesCotizacionBackend(
                items
            );

        data.subtotal =
            totalesCalculados.subtotal;

        data.descuentos =
            totalesCalculados.descuentos;

        data.iva =
            totalesCalculados.iva;

        data.total =
            totalesCalculados.total;

        const secciones = parseSecciones(req.body.secciones) ?? [];

        const nueva = await prisma.$transaction(async (tx) => {
            const creada = await tx.cotizacionGestioo.create({
                data: {
                    ...data,
                    comentariosCotizacion: req.body.comentariosCotizacion ?? null,
                    imagen: req.body.imagen ?? null,
                    tecnicoId: userId,
                },
            });

            /* Secciones: clave temporal del frontend → id real */
            const mapaSecciones = new Map<number, number>();

            for (const seccion of secciones) {
                const creadaSeccion = await tx.cotizacionSeccionGestioo.create({
                    data: {
                        cotizacionId: creada.id,
                        nombre: seccion.nombre,
                        descripcion: seccion.descripcion,
                        orden: seccion.orden,
                    },
                });

                if (seccion.clave !== null) {
                    mapaSecciones.set(seccion.clave, creadaSeccion.id);
                }
            }

            await tx.cotizacionItemGestioo.createMany({
                data: items.map((i: any) => {
                    const precioCLP =
                        redondearDinero(
                            parseDecimalInput(
                                i.precioOriginalCLP ??
                                i.precio,
                                0
                            )
                        );

                    return {
                        cotizacionId: creada.id,
                        seccionId: resolverSeccionId(i.seccionId, mapaSecciones),

                        tipo: i.tipo,

                        // TEXTO
                        nombre: i.nombre?.trim() ?? i.descripcion?.trim() ?? "",
                        descripcion:
                            i.descripcion?.trim() && i.descripcion.trim() !== ""
                                ? i.descripcion.trim()
                                : "", // <-- Cambiar null por string vacío

                        cantidad:
                            normalizarCantidad(
                                i.cantidad
                            ),

                        precio:
                            precioCLP,

                        precioOriginalCLP:
                            precioCLP,

                        precioCosto:
                            i.precioCosto != null
                                ? redondearDinero(
                                    parseDecimalInput(
                                        i.precioCosto,
                                        0
                                    )
                                )
                                : null,

                        porcGanancia:
                            i.porcGanancia != null
                                ? normalizarGanancia(
                                    i.porcGanancia
                                )
                                : null,

                        tieneDescuento:
                            Boolean(
                                i.tieneDescuento
                            ),

                        porcentaje:
                            i.tieneDescuento
                                ? normalizarDescuento(
                                    i.porcentaje
                                )
                                : 0,

                        tieneIVA:
                            Boolean(
                                i.tieneIVA
                            ),

                        // OTROS
                        sku:
                            i.sku && i.sku.trim() !== ""
                                ? i.sku
                                : generarSKU(),
                        imagen: i.imagen ?? null,

                        productoId:
                            i.productoId != null
                                ? Number(i.productoId)
                                : null,

                        equipoId: i.equipoId ? Number(i.equipoId) : null,
                    };
                }),
            });

            return tx.cotizacionGestioo.findUniqueOrThrow({
                where: { id: creada.id },
                include: {
                    entidad: true,
                    items: { orderBy: { id: "asc" } },
                    secciones: { orderBy: ORDEN_SECCIONES },
                    tecnico: {
                        select: {
                            id_tecnico: true,
                            nombre: true,
                            email: true,
                        },
                    },
                },
            });
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
            include: {
                items: true,
                secciones: { select: { id: true } },
            },
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

        /* undefined = no se tocan secciones ni el seccionId de los ítems */
        const secciones = parseSecciones(req.body.secciones);

        if (Array.isArray(items)) {
            const totalesCalculados =
                calcularTotalesCotizacionBackend(
                    items
                );

            data.subtotal =
                totalesCalculados.subtotal;

            data.descuentos =
                totalesCalculados.descuentos;

            data.iva =
                totalesCalculados.iva;

            data.total =
                totalesCalculados.total;
        }

        // 1️⃣ Preparar filtro para items: SOLO LOS QUE EXISTEN EN DB (con ID numérico válido)
        await prisma.$transaction(async (tx) => {
            await tx.cotizacionGestioo.update({
                where: { id },
                data: {
                    ...data,

                    ...(req.body.comentariosCotizacion !== undefined && {
                        comentariosCotizacion: req.body.comentariosCotizacion,
                    }),

                    ...(req.body.imagen !== undefined && {
                        imagen: req.body.imagen,
                    }),
                },
            });

            // 1.5️⃣ Sincronizar secciones (solo si vienen en el body)
            let mapaSecciones: Map<number, number> | null = null;

            if (secciones !== undefined) {
                mapaSecciones = new Map<number, number>();

                const idsSeccionesBD = new Set(existe.secciones.map((sec) => sec.id));
                const idsQueSiguen = new Set<number>();

                for (const seccion of secciones) {
                    if (seccion.clave !== null && idsSeccionesBD.has(seccion.clave)) {
                        await tx.cotizacionSeccionGestioo.update({
                            where: { id: seccion.clave },
                            data: {
                                nombre: seccion.nombre,
                                descripcion: seccion.descripcion,
                                orden: seccion.orden,
                            },
                        });
                        mapaSecciones.set(seccion.clave, seccion.clave);
                        idsQueSiguen.add(seccion.clave);
                    } else {
                        const creadaSeccion = await tx.cotizacionSeccionGestioo.create({
                            data: {
                                cotizacionId: id,
                                nombre: seccion.nombre,
                                descripcion: seccion.descripcion,
                                orden: seccion.orden,
                            },
                        });
                        if (seccion.clave !== null) {
                            mapaSecciones.set(seccion.clave, creadaSeccion.id);
                        }
                    }
                }

                const idsSeccionesAEliminar = [...idsSeccionesBD].filter(
                    (seccionId) => !idsQueSiguen.has(seccionId)
                );

                if (idsSeccionesAEliminar.length > 0) {
                    /* relationMode = "prisma": se desvinculan los ítems a mano */
                    await tx.cotizacionItemGestioo.updateMany({
                        where: { cotizacionId: id, seccionId: { in: idsSeccionesAEliminar } },
                        data: { seccionId: null },
                    });

                    await tx.cotizacionSeccionGestioo.deleteMany({
                        where: { cotizacionId: id, id: { in: idsSeccionesAEliminar } },
                    });
                }
            }

            const seccionDeItem = (i: any) =>
                mapaSecciones
                    ? { seccionId: resolverSeccionId(i.seccionId, mapaSecciones) }
                    : {};

            // 2️⃣ Si se incluyen items, procesar actualizaciones, eliminaciones y creaciones
            if (items !== undefined) {
                const idsExistentesBD = existe.items.map((item) => item.id);

                const itemsConIdNumerico = items.filter(
                    (i: any) =>
                        typeof i.id === "number" &&
                        idsExistentesBD.includes(i.id) // SOLO SI EXISTE EN DB
                );

                const idsQueSiguen = itemsConIdNumerico.map((i: any) => i.id);

                const idsAEliminar = idsExistentesBD.filter(
                    (itemId) => !idsQueSiguen.includes(itemId)
                );

                if (idsAEliminar.length > 0) {
                    await tx.cotizacionItemGestioo.deleteMany({
                        where: {
                            id: { in: idsAEliminar },
                            cotizacionId: id,
                        },
                    });
                }

                // ACTUALIZAR items existentes (con ID numérico válido y que existan en DB)
                for (const i of itemsConIdNumerico) {
                    await tx.cotizacionItemGestioo.update({
                        where: { id: i.id },
                        data: {
                            tipo: i.tipo,
                            nombre: i.nombre?.trim() ?? "",
                            descripcion: i.descripcion?.trim() ?? "",
                            cantidad:
                                normalizarCantidad(
                                    i.cantidad
                                ),

                            precio:
                                redondearDinero(
                                    parseDecimalInput(
                                        i.precioOriginalCLP ??
                                        i.precio,
                                        0
                                    )
                                ),

                            precioOriginalCLP:
                                redondearDinero(
                                    parseDecimalInput(
                                        i.precioOriginalCLP ??
                                        i.precio,
                                        0
                                    )
                                ),

                            precioCosto:
                                i.precioCosto != null
                                    ? redondearDinero(
                                        parseDecimalInput(
                                            i.precioCosto,
                                            0
                                        )
                                    )
                                    : null,

                            porcGanancia:
                                i.porcGanancia != null
                                    ? normalizarGanancia(
                                        i.porcGanancia
                                    )
                                    : null,

                            tieneDescuento:
                                Boolean(
                                    i.tieneDescuento
                                ),

                            porcentaje:
                                i.tieneDescuento
                                    ? normalizarDescuento(
                                        i.porcentaje
                                    )
                                    : 0,

                            productoId:
                                i.productoId != null
                                    ? Number(i.productoId)
                                    : null,

                            tieneIVA:
                                Boolean(
                                    i.tieneIVA
                                ),
                            sku: i.sku?.trim() || generarSKU(),
                            imagen: i.imagen ?? null,
                            equipoId: i.equipoId ? Number(i.equipoId) : null,
                            ...seccionDeItem(i),
                        },
                    });
                }

                const itemsNuevos = items.filter(
                    (i: any) => !(typeof i.id === "number" && i.id > 0)
                );

                // CREAR nuevos items (SIN ID numérico válido)
                if (itemsNuevos.length > 0) {
                    await tx.cotizacionItemGestioo.createMany({
                        data: itemsNuevos.map((i: any) => {
                            const precioCLP =
                                redondearDinero(
                                    parseDecimalInput(
                                        i.precioOriginalCLP ??
                                        i.precio,
                                        0
                                    )
                                );

                            return {
                                cotizacionId:
                                    id,

                                ...seccionDeItem(i),

                                tipo:
                                    i.tipo,

                                nombre:
                                    i.nombre?.trim() ?? "",

                                descripcion:
                                    i.descripcion?.trim() ?? "",

                                /*
                                 * Prisma mantiene cantidad como Int.
                                 */
                                cantidad:
                                    normalizarCantidad(
                                        i.cantidad
                                    ),

                                /*
                                 * Precio en CLP con hasta dos decimales.
                                 */
                                precio:
                                    precioCLP,

                                precioOriginalCLP:
                                    precioCLP,

                                precioCosto:
                                    i.precioCosto != null
                                        ? redondearDinero(
                                            parseDecimalInput(
                                                i.precioCosto,
                                                0
                                            )
                                        )
                                        : null,

                                porcGanancia:
                                    i.porcGanancia != null
                                        ? normalizarGanancia(
                                            i.porcGanancia
                                        )
                                        : null,

                                tieneDescuento:
                                    Boolean(
                                        i.tieneDescuento
                                    ),

                                porcentaje:
                                    i.tieneDescuento
                                        ? normalizarDescuento(
                                            i.porcentaje
                                        )
                                        : 0,

                                tieneIVA:
                                    Boolean(
                                        i.tieneIVA
                                    ),

                                sku:
                                    i.sku?.trim() ||
                                    generarSKU(),

                                imagen:
                                    i.imagen ?? null,

                                productoId:
                                    i.productoId != null
                                        ? Number(i.productoId)
                                        : null,

                                equipoId:
                                    i.equipoId
                                        ? Number(
                                            i.equipoId
                                        )
                                        : null,
                            };
                        }),
                    });
                }
            }
        });

        // 3️⃣ Retornar cotización actualizada con items
        const updated = await prisma.cotizacionGestioo.findUnique({
            where: { id },
            include: {
                entidad: true,
                secciones: { orderBy: ORDEN_SECCIONES },
                items: {
                    include: {
                        equipo: {
                            select: {
                                id_equipo: true,
                                serial: true,
                                marca: true,
                                modelo: true,
                            },
                        },
                    },
                },
                tecnico: {
                    select: { id_tecnico: true, nombre: true, email: true },
                },
            },
        });

        // Punto de integración con el funnel de oportunidades: si la cotización
        // quedó vinculada a una oportunidad y su estado pasó a APROBADA/FACTURADA,
        // sincroniza la etapa de la oportunidad (no bloqueante, ver oportunidades.service.ts).
        if (
            updated?.oportunidadVentaId &&
            data.estado &&
            existe.estado !== updated.estado &&
            (updated.estado === "APROBADA" || updated.estado === "FACTURADA")
        ) {
            const actorId = (req as any).user?.id ? Number((req as any).user.id) : null;
            await sincronizarOportunidadPorCotizacionAprobada(updated.id, actorId);
        }

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

// =====================================================
//   VINCULAR / DESVINCULAR EQUIPO A ITEM
// =====================================================
export async function vincularEquipoAItem(req: Request, res: Response) {
    const itemId = Number(req.params.itemId);
    const { equipoId } = req.body;

    if (isNaN(itemId)) {
        return res.status(400).json({ error: "itemId inválido" });
    }

    try {
        const updated = await prisma.cotizacionItemGestioo.update({
            where: { id: itemId },
            data: { equipoId: equipoId ? Number(equipoId) : null },
            include: {
                equipo: {
                    select: {
                        id_equipo: true,
                        serial: true,
                        marca: true,
                        modelo: true,
                    },
                },
            },
        });

        return res.json({ ok: true, item: updated });
    } catch (error: any) {
        console.error("❌ Error vincularEquipoAItem:", error);
        return res.status(500).json({ error: "Error al vincular equipo" });
    }
}

// =====================================================
//      FACTURAR COTIZACIÓN - CREAR FACTURA + CAMBIAR ESTADO
// =====================================================
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

// =====================================================
//      PAGAR FACTURA - SOLO SI NO ESTÁ ANULADA
// =====================================================
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

// =====================================================
//      PAGAR FACTURA - SOLO CAMBIAR ESTADO A PAGADA
// =====================================================
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

// =====================================================
//      EDICIÓN NÚMERO FACTURA - SOLO PENDIENTES
// =====================================================
/*
export async function editarNumeroFactura(req: Request, res: Response) {
    const { id } = req.params;
    const { numeroFactura } = req.body;

    try {
        if (!numeroFactura || numeroFactura.trim() === "") {
            return res.status(400).json({ error: "Número de factura inválido" });
        }

        const factura = await prisma.factura.findUnique({
            where: { id_factura: Number(id) },
        });

        if (!factura)
            return res.status(404).json({ error: "Factura no encontrada" });

        // 🔥 REGLA DE SEGURIDAD
        if (factura.estado !== "PENDIENTE") {
            return res.status(400).json({
                error: "Solo se puede editar el número de facturas pendientes"
            });
        }

        // 🔥 Validar que no exista otro número igual
        const existeNumero = await prisma.factura.findFirst({
            where: {
                numeroFactura,
                NOT: { id_factura: factura.id_factura }
            }
        });

        if (existeNumero) {
            return res.status(400).json({
                error: "Ya existe una factura con ese número"
            });
        }

        const actualizada = await prisma.factura.update({
            where: { id_factura: factura.id_factura },
            data: { numeroFactura }
        });

        res.json({ message: "Número actualizado", factura: actualizada });

    } catch (error) {
        console.error(error);
        res.status(500).json({ error: "Error al actualizar número de factura" });
    }
} */

// =====================================================
//      CAMBIAR ESTADO FACTURA (PENDIENTE, PAGADA, ANULADA)
// =====================================================
export async function cambiarEstadoFactura(req: Request, res: Response) {
    const { id } = req.params;
    const { estado } = req.body;

    try {
        const factura = await prisma.factura.update({
            where: { id_factura: Number(id) },
            data: { estadoSII: estado }
        });

        res.json(factura);

    } catch (error) {
        res.status(500).json({ error: "Error actualizando estado" });
    }
}

// =====================================================
//      INTEGRACIÓN SII - SIMPLE API
// =====================================================

// =====================================================
//      EMITIR FACTURA AL SII - SOLO PARA COTIZACIONES APROBADAS
// =====================================================

/*
export async function emitirFacturaSII(req: Request, res: Response) {

    const { id } = req.params;

    try {

        const cotizacion = await prisma.cotizacionGestioo.findUnique({
            where: { id: Number(id) },
            include: {
                entidad: true,
                items: true
            }
        });

        if (!cotizacion)
            return res.status(404).json({ error: "Cotización no encontrada" });

        if (cotizacion.estado !== "APROBADA")
            return res.status(400).json({ error: "Solo cotizaciones aprobadas pueden emitirse" });

        if (!cotizacion.items.length)
            return res.status(400).json({ error: "La cotización no tiene items" });

        const config = getSimpleAPIConfig();

        if (!cotizacion.entidad?.rut)
            return res.status(400).json({ error: "La entidad no tiene RUT" });

        const rutReceptor = String(cotizacion.entidad.rut).replace(/\./g, "").trim();

        // Emitir DTE
        const dte = await generarDTE(config, { cotizacion });

        const envio = {
            trackId: dte.trackId ?? null
        };

        // Crear factura
        const factura = await prisma.factura.create({
            data: {
                numeroFactura: `INT-${dte.folio}`,
                total: cotizacion.total,
                cotizacionId: cotizacion.id,
                tipoDTE: 33,
                folioSII: String(dte.folio),
                rutEmisor: config.rutEmpresa,
                rutReceptor: rutReceptor,
                estadoSII: EstadoDTE.EMITIDO,
                trackId: envio.trackId
            }
        });

        await prisma.cotizacionGestioo.update({
            where: { id: cotizacion.id },
            data: { estado: "FACTURADA" }
        });

        return res.json({
            message: "Factura emitida correctamente",
            folio: dte.folio,
            trackId: envio.trackId
        });

    } catch (error: any) {

        console.error("Error emitirFacturaSII:", error);

        return res.status(500).json({
            error: error.message
        });

    }
}

// =====================================================
//      CONSULTAR ESTADO ENVÍO SII - ACTUALIZAR ESTADO LOCAL
// =====================================================
export async function consultarEnvioSII(req: Request, res: Response) {
    const { id } = req.params;

    try {
        const factura = await prisma.factura.findUnique({
            where: { id_factura: Number(id) }
        });

        if (!factura?.trackId)
            return res.status(400).json({
                error: "Factura no fue emitida desde el sistema"
            });

        const config = getSimpleAPIConfig();

        const result = await consultarEstadoEnvio(
            config,
            factura.trackId
        );

        await prisma.factura.update({
            where: { id_factura: factura.id_factura },
            data: {
                estadoSII: mapEstadoSimpleAPIToEnum(result.estado),
                fechaEnvioSII: new Date()
            }
        });

        return res.json({
            message: "Estado actualizado",
            estado: result.estado
        });

    } catch (error: any) {
        console.error("❌ Error consultarEnvioSII:", error.message);
        return res.status(500).json({ error: error.message });
    }
}

// =====================================================
//      VINCULAR FACTURA SII EXISTENTE - SOLO PARA COTIZACIONES APROBADAS
// =====================================================
export async function vincularFacturaSII(req: Request, res: Response) {
    const { id } = req.params;  //  CAMBIAR ESTO
    const { tipoDTE, folioSII, rutEmisor } = req.body;

    try {
        const cotizacion = await prisma.cotizacionGestioo.findUnique({
            where: { id: Number(id) },  //  USAR PARAM
            include: { entidad: true }
        });

        if (!cotizacion)
            return res.status(404).json({ error: "Cotización no encontrada" });

        // =====================================================
        // VALIDAR ESTADO DE COTIZACIÓN
        // =====================================================

        if (cotizacion.estado !== "APROBADA") {
            return res.status(400).json({
                error: "Solo se pueden vincular facturas a cotizaciones aprobadas"
            });
        }

        // =====================================================
        // VALIDAR QUE EL FOLIO NO ESTÉ REGISTRADO
        // =====================================================

        const existe = await prisma.factura.findFirst({
            where: {
                folioSII: String(folioSII),
                tipoDTE: Number(tipoDTE)
            }
        });

        if (existe) {
            return res.status(400).json({
                error: `El folio ${folioSII} ya está registrado en el sistema`
            });
        }

        // =====================================================
        // CREAR FACTURA VINCULADA A LA COTIZACIÓN
        // =====================================================

        const factura = await prisma.factura.create({
            data: {
                numeroFactura: `EXT-${folioSII}`,
                total: cotizacion.total,
                cotizacionId: cotizacion.id,
                tipoDTE: Number(tipoDTE),
                folioSII: String(folioSII),
                rutEmisor,
                rutReceptor: cotizacion.entidad?.rut ?? null,
                estadoSII: EstadoDTE.RECIBIDO
            }
        });

        return res.json({ message: "Factura vinculada correctamente", factura });

    } catch (error: any) {
        console.error("🔥 ERROR REAL:", error);
        return res.status(500).json({ error: error.message });
    }
}

// =====================================================
//      CONSULTAR ESTADO SII - ACTUALIZAR ESTADO LOCAL
// =====================================================
export async function consultarEstadoSII(req: Request, res: Response) {
    const { id } = req.params;

    try {
        const factura = await prisma.factura.findUnique({
            where: { id_factura: Number(id) }
        });

        if (!factura?.trackId) {
            return res.status(400).json({
                error: "Factura no fue emitida desde el sistema"
            });
        }

        const config = getSimpleAPIConfig();

        const result = await consultarEstadoEnvio(
            config,
            factura.trackId
        );

        await prisma.factura.update({
            where: { id_factura: factura.id_factura },
            data: {
                estadoSII: mapEstadoSimpleAPIToEnum(result.estado),
                fechaEnvioSII: new Date()
            }
        });

        return res.json({
            message: "Estado actualizado",
            estado: result.estado
        });

    } catch (error: any) {
        console.error("❌ Error consultarEstadoSII:", error.message);
        return res.status(500).json({
            error: error.message ?? "Error consultando SII"
        });
    }
}
*/
