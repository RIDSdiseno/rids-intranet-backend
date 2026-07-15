// src/controllers/controllers-cotizaciones/cotizaciones-masivas.controller.ts
import { prisma } from "../../lib/prisma.js";
import { generarSKU } from "./cotizaciones.controller.js";
// =====================================================
//     CONSTANTES DE LÍMITES
// =====================================================
const MAX_COTIZACIONES_MASIVAS = 20;
const MAX_ITEMS_POR_COTIZACION = 10;
const MAX_ITEMS_TOTALES = 100;
// =====================================================
//      HELPERS DE CÁLCULO PARA COTIZACIONES MASIVAS
// =====================================================
const IVA_CHILE = 0.19;
function redondearCLP(valor) {
    // Redondea montos para evitar decimales en CLP.
    return Math.round(Number(valor || 0));
}
function calcularPrecioVentaProductoMasivo(producto) {
    /*
        Criterio usado:
        1. Si el producto tiene precioTotal, se usa como precio de venta final.
        2. Si no tiene precioTotal, se calcula usando precio + porcGanancia.
        3. Si porcGanancia viene null, se toma como 0.
    */
    const precioCosto = Number(producto.precio ?? 0);
    const precioTotal = producto.precioTotal != null
        ? Number(producto.precioTotal)
        : null;
    const porcGanancia = Number(producto.porcGanancia ?? 0);
    if (precioTotal != null && precioTotal > 0) {
        return redondearCLP(precioTotal);
    }
    return redondearCLP(precioCosto * (1 + porcGanancia / 100));
}
function calcularItemMasivo(producto, cantidadInput) {
    /*
        Genera un item listo para crear en CotizacionItemGestioo.
        Tu modelo ProductoGestioo no tiene campo tieneIVA, por eso se asume true.
    */
    const cantidad = Math.max(1, Number(cantidadInput || 1));
    const precioCosto = redondearCLP(Number(producto.precio ?? 0));
    const porcGanancia = producto.porcGanancia != null ? Number(producto.porcGanancia) : null;
    const precioVenta = calcularPrecioVentaProductoMasivo(producto);
    const subtotalItem = redondearCLP(precioVenta * cantidad);
    // Como ProductoGestioo no tiene tieneIVA, asumimos que todos los productos llevan IVA.
    const tieneIVA = true;
    const ivaItem = tieneIVA ? redondearCLP(subtotalItem * IVA_CHILE) : 0;
    return {
        producto,
        cantidad,
        precioVenta,
        precioCosto,
        porcGanancia,
        tieneIVA,
        subtotalItem,
        ivaItem,
        totalItem: subtotalItem + ivaItem,
    };
}
function calcularTotalesMasivos(items) {
    // Calcula los totales finales de cada cotización generada masivamente.
    const subtotal = redondearCLP(items.reduce((acc, item) => acc + item.subtotalItem, 0));
    const iva = redondearCLP(items.reduce((acc, item) => acc + item.ivaItem, 0));
    const descuentos = 0;
    const total = subtotal + iva - descuentos;
    return {
        subtotal,
        descuentos,
        iva,
        total,
    };
}
// =====================================================
//    ENDPOINT DE CREAR COTIZACIONES MASIVAS
// =====================================================
export async function createCotizacionesMasivas(req, res) {
    try {
        const user = req.user;
        const userId = user?.id;
        if (!userId) {
            return res.status(401).json({
                error: "No autenticado",
            });
        }
        const { cotizaciones, comentariosCotizacion, nombreGrupo, } = req.body;
        if (!Array.isArray(cotizaciones) || cotizaciones.length === 0) {
            return res.status(400).json({
                error: "Debes enviar al menos una cotización.",
            });
        }
        if (cotizaciones.length > MAX_COTIZACIONES_MASIVAS) {
            return res.status(400).json({
                error: `No puedes generar más de ${MAX_COTIZACIONES_MASIVAS} cotizaciones por solicitud.`,
            });
        }
        const totalItemsSolicitados = cotizaciones.reduce((acc, cot) => acc + (Array.isArray(cot.items) ? cot.items.length : 0), 0);
        if (totalItemsSolicitados > MAX_ITEMS_TOTALES) {
            return res.status(400).json({
                error: `No puedes generar más de ${MAX_ITEMS_TOTALES} ítems en una sola solicitud.`,
            });
        }
        const cotizacionConDemasiadosItems = cotizaciones.find((cot) => Array.isArray(cot.items) &&
            cot.items.length > MAX_ITEMS_POR_COTIZACION);
        if (cotizacionConDemasiadosItems) {
            return res.status(400).json({
                error: `Cada cotización puede tener como máximo ${MAX_ITEMS_POR_COTIZACION} productos.`,
            });
        }
        const resultados = await prisma.$transaction(async (tx) => {
            // Arreglo tipado para evitar que TypeScript lo infiera como never[].
            // Aquí se guardan las cotizaciones creadas dentro de la transacción.
            const creadas = [];
            for (const cot of cotizaciones) {
                const entidadId = Number(cot.entidadId);
                if (!entidadId) {
                    throw new Error("Todas las cotizaciones deben tener entidadId.");
                }
                if (!Array.isArray(cot.items) || cot.items.length === 0) {
                    throw new Error("Todas las cotizaciones deben tener al menos un item.");
                }
                const entidad = await tx.entidadGestioo.findUnique({
                    where: {
                        id: entidadId,
                    },
                });
                if (!entidad) {
                    throw new Error(`No existe la entidad con ID ${entidadId}.`);
                }
                const nombreGrupoLimpio = nombreGrupo?.trim();
                const comentarioBase = cot.comentariosCotizacion ??
                    comentariosCotizacion ??
                    "Cotización generada masivamente.";
                const comentarioFinal = nombreGrupoLimpio
                    ? `[${nombreGrupoLimpio}] ${comentarioBase}`
                    : comentarioBase;
                const productoIds = cot.items.map((item) => Number(item.productoId));
                const productos = await tx.productoGestioo.findMany({
                    where: {
                        id: {
                            in: productoIds,
                        },
                        activo: true,
                    },
                    select: {
                        id: true,
                        nombre: true,
                        descripcion: true,
                        precio: true,
                        precioTotal: true,
                        porcGanancia: true,
                        serie: true,
                        imagen: true,
                    },
                });
                if (productos.length !== productoIds.length) {
                    throw new Error(`Hay productos inválidos o inactivos para la entidad ${entidad.nombre}.`);
                }
                const itemsNormalizados = cot.items.map((item) => {
                    const producto = productos.find((p) => p.id === Number(item.productoId));
                    if (!producto) {
                        throw new Error(`Producto ${item.productoId} no encontrado.`);
                    }
                    // Calcula precio venta, ganancia, subtotal e IVA por producto.
                    return calcularItemMasivo(producto, Number(item.cantidad));
                });
                const totales = calcularTotalesMasivos(itemsNormalizados);
                const subtotalBruto = itemsNormalizados.reduce((acc, item) => acc + item.subtotalItem, 0);
                const iva = Math.round(subtotalBruto * 0.19);
                const total = subtotalBruto + iva;
                const nuevaCotizacion = await tx.cotizacionGestioo.create({
                    data: {
                        entidadId,
                        estado: "BORRADOR",
                        tipo: "CLIENTE",
                        moneda: "CLP",
                        tasaCambio: 1,
                        subtotal: totales.subtotal,
                        descuentos: totales.descuentos,
                        iva: totales.iva,
                        total: totales.total,
                        // MISMA IDEA QUE createCotizacion NORMAL
                        tecnicoId: userId,
                        comentariosCotizacion: comentarioFinal,
                        items: {
                            create: itemsNormalizados.map((item) => ({
                                tipo: "PRODUCTO",
                                nombre: item.producto.nombre?.trim() ?? "",
                                descripcion: item.producto.descripcion?.trim() ?? "",
                                cantidad: item.cantidad,
                                precio: item.precioVenta,
                                precioOriginalCLP: item.precioVenta,
                                precioCosto: item.precioCosto,
                                porcGanancia: item.porcGanancia,
                                tieneIVA: item.tieneIVA,
                                tieneDescuento: false,
                                porcentaje: 0,
                                sku: item.producto.serie &&
                                    item.producto.serie.trim() !== ""
                                    ? item.producto.serie
                                    : generarSKU(),
                                imagen: item.producto.imagen ?? null,
                            })),
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
                creadas.push(nuevaCotizacion);
            }
            return creadas;
        });
        return res.status(201).json({
            ok: true,
            message: `${resultados.length} cotización(es) generada(s) correctamente.`,
            data: resultados,
        });
    }
    catch (error) {
        console.error("❌ Error createCotizacionesMasivas:", error);
        return res.status(500).json({
            error: error?.message ?? "Error al crear cotizaciones masivas.",
        });
    }
}
export async function listarPlantillasMasivas(req, res) {
    try {
        const plantillas = await prisma.cotizacionMasivaPlantilla.findMany({
            where: {
                activo: true,
            },
            orderBy: {
                createdAt: "desc",
            },
            include: {
                tecnico: {
                    select: {
                        id_tecnico: true,
                        nombre: true,
                        email: true,
                    },
                },
                items: {
                    include: {
                        producto: true,
                    },
                },
                entidades: {
                    include: {
                        entidad: true,
                        cantidades: {
                            include: {
                                producto: true,
                            },
                        },
                    },
                },
                ejecuciones: {
                    orderBy: {
                        fecha: "desc",
                    },
                    take: 3,
                },
            },
        });
        return res.json({
            ok: true,
            data: plantillas,
        });
    }
    catch (error) {
        console.error("Error listarPlantillasMasivas:", error);
        return res.status(500).json({
            error: "Error al listar plantillas masivas.",
        });
    }
}
export async function crearPlantillaMasiva(req, res) {
    try {
        const user = req.user;
        const userId = user?.id ?? null;
        const { nombre, descripcion, productos, entidades, } = req.body;
        if (!nombre?.trim()) {
            return res.status(400).json({
                error: "El nombre de la plantilla es obligatorio.",
            });
        }
        if (!Array.isArray(productos) || productos.length === 0) {
            return res.status(400).json({
                error: "Debes seleccionar al menos un producto.",
            });
        }
        if (!Array.isArray(entidades) || entidades.length === 0) {
            return res.status(400).json({
                error: "Debes seleccionar al menos una entidad.",
            });
        }
        const plantilla = await prisma.cotizacionMasivaPlantilla.create({
            data: {
                nombre: nombre.trim(),
                descripcion: descripcion?.trim() || null,
                tecnicoId: userId,
                items: {
                    create: productos.map((producto) => ({
                        productoId: Number(producto.productoId),
                    })),
                },
                entidades: {
                    create: entidades.map((entidad) => ({
                        entidadId: Number(entidad.entidadId),
                        cantidades: {
                            create: entidad.cantidades
                                .filter((cantidad) => Number(cantidad.cantidad) > 0)
                                .map((cantidad) => ({
                                productoId: Number(cantidad.productoId),
                                cantidad: Number(cantidad.cantidad),
                            })),
                        },
                    })),
                },
            },
            include: {
                items: {
                    include: {
                        producto: true,
                    },
                },
                entidades: {
                    include: {
                        entidad: true,
                        cantidades: {
                            include: {
                                producto: true,
                            },
                        },
                    },
                },
            },
        });
        return res.status(201).json({
            ok: true,
            message: "Plantilla masiva creada correctamente.",
            data: plantilla,
        });
    }
    catch (error) {
        console.error("Error crearPlantillaMasiva:", error);
        return res.status(500).json({
            error: "Error al crear plantilla masiva.",
        });
    }
}
export async function generarCotizacionesDesdePlantilla(req, res) {
    try {
        const user = req.user;
        const userId = user?.id;
        if (!userId) {
            return res.status(401).json({
                error: "No autenticado.",
            });
        }
        const plantillaId = Number(req.params.id);
        if (!plantillaId) {
            return res.status(400).json({
                error: "ID de plantilla inválido.",
            });
        }
        const { nombreEjecucion } = req.body;
        const plantilla = await prisma.cotizacionMasivaPlantilla.findUnique({
            where: {
                id: plantillaId,
            },
            include: {
                items: {
                    include: {
                        producto: true,
                    },
                },
                entidades: {
                    include: {
                        entidad: true,
                        cantidades: {
                            include: {
                                producto: true,
                            },
                        },
                    },
                },
            },
        });
        if (!plantilla || !plantilla.activo) {
            return res.status(404).json({
                error: "Plantilla no encontrada.",
            });
        }
        const resultados = await prisma.$transaction(async (tx) => {
            // Arreglo tipado para almacenar las cotizaciones generadas desde plantilla.
            // Evita el error: Argument of type ... is not assignable to parameter of type never.
            const creadas = [];
            for (const entidadPlantilla of plantilla.entidades) {
                const itemsValidos = entidadPlantilla.cantidades.filter((cantidad) => Number(cantidad.cantidad) > 0);
                if (itemsValidos.length === 0) {
                    continue;
                }
                const itemsNormalizados = itemsValidos.map((item) => calcularItemMasivo(item.producto, Number(item.cantidad)));
                const totales = calcularTotalesMasivos(itemsNormalizados);
                const comentarioFinal = nombreEjecucion?.trim()
                    ? `[${nombreEjecucion.trim()}] ${plantilla.descripcion ?? plantilla.nombre}`
                    : `[${plantilla.nombre}] ${plantilla.descripcion ?? "Cotización generada desde plantilla masiva."}`;
                const cotizacion = await tx.cotizacionGestioo.create({
                    data: {
                        entidadId: entidadPlantilla.entidadId,
                        estado: "BORRADOR",
                        tipo: "CLIENTE",
                        moneda: "CLP",
                        tasaCambio: 1,
                        subtotal: totales.subtotal,
                        descuentos: totales.descuentos,
                        iva: totales.iva,
                        total: totales.total,
                        tecnicoId: userId,
                        comentariosCotizacion: comentarioFinal,
                        items: {
                            create: itemsNormalizados.map((item) => ({
                                tipo: "PRODUCTO",
                                nombre: item.producto.nombre?.trim() ?? "",
                                descripcion: item.producto.descripcion?.trim() ?? "",
                                cantidad: item.cantidad,
                                // Precio final unitario con ganancia aplicada.
                                precio: item.precioVenta,
                                precioOriginalCLP: item.precioVenta,
                                // Costo y ganancia guardados para que la cotización quede igual que una normal.
                                precioCosto: item.precioCosto,
                                porcGanancia: item.porcGanancia,
                                // Tu ProductoGestioo no tiene campo tieneIVA, por eso se asume true.
                                tieneIVA: item.tieneIVA,
                                tieneDescuento: false,
                                porcentaje: 0,
                                sku: item.producto.serie &&
                                    item.producto.serie.trim() !== ""
                                    ? item.producto.serie
                                    : generarSKU(),
                                imagen: item.producto.imagen ?? null,
                            })),
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
                creadas.push(cotizacion);
            }
            await tx.cotizacionMasivaEjecucion.create({
                data: {
                    plantillaId,
                    nombre: nombreEjecucion?.trim() || null,
                    totalCotizaciones: creadas.length,
                },
            });
            return creadas;
        });
        return res.status(201).json({
            ok: true,
            message: `${resultados.length} cotización(es) generada(s) desde plantilla.`,
            data: resultados,
        });
    }
    catch (error) {
        console.error("Error generarCotizacionesDesdePlantilla:", error);
        return res.status(500).json({
            error: "Error al generar cotizaciones desde plantilla.",
        });
    }
}
export async function actualizarPlantillaMasiva(req, res) {
    try {
        const plantillaId = Number(req.params.id);
        if (!plantillaId || Number.isNaN(plantillaId)) {
            return res.status(400).json({
                error: "ID de plantilla inválido.",
            });
        }
        const { nombre, descripcion, productos, entidades, } = req.body;
        if (!nombre?.trim()) {
            return res.status(400).json({
                error: "El nombre de la plantilla es obligatorio.",
            });
        }
        if (!Array.isArray(productos) || productos.length === 0) {
            return res.status(400).json({
                error: "Debes seleccionar al menos un producto.",
            });
        }
        if (!Array.isArray(entidades) || entidades.length === 0) {
            return res.status(400).json({
                error: "Debes seleccionar al menos una entidad.",
            });
        }
        const productosValidos = productos
            .map((producto) => ({
            productoId: Number(producto.productoId),
        }))
            .filter((producto) => producto.productoId > 0);
        const entidadesValidas = entidades
            .map((entidad) => ({
            entidadId: Number(entidad.entidadId),
            cantidades: Array.isArray(entidad.cantidades)
                ? entidad.cantidades
                    .map((cantidad) => ({
                    productoId: Number(cantidad.productoId),
                    cantidad: Number(cantidad.cantidad),
                }))
                    .filter((cantidad) => cantidad.productoId > 0 &&
                    cantidad.cantidad > 0)
                : [],
        }))
            .filter((entidad) => entidad.entidadId > 0 &&
            entidad.cantidades.length > 0);
        if (productosValidos.length === 0) {
            return res.status(400).json({
                error: "No hay productos válidos para guardar.",
            });
        }
        if (entidadesValidas.length === 0) {
            return res.status(400).json({
                error: "No hay entidades con cantidades válidas.",
            });
        }
        const plantillaExistente = await prisma.cotizacionMasivaPlantilla.findUnique({
            where: {
                id: plantillaId,
            },
            select: {
                id: true,
                activo: true,
            },
        });
        if (!plantillaExistente || !plantillaExistente.activo) {
            return res.status(404).json({
                error: "Plantilla no encontrada.",
            });
        }
        await prisma.$transaction(async (tx) => {
            const entidadesActuales = await tx.cotizacionMasivaPlantillaEntidad.findMany({
                where: {
                    plantillaId,
                },
                select: {
                    id: true,
                },
            });
            const entidadIdsActuales = entidadesActuales.map((item) => item.id);
            if (entidadIdsActuales.length > 0) {
                await tx.cotizacionMasivaPlantillaCantidad.deleteMany({
                    where: {
                        plantillaEntidadId: {
                            in: entidadIdsActuales,
                        },
                    },
                });
            }
            await tx.cotizacionMasivaPlantillaEntidad.deleteMany({
                where: {
                    plantillaId,
                },
            });
            await tx.cotizacionMasivaPlantillaItem.deleteMany({
                where: {
                    plantillaId,
                },
            });
            await tx.cotizacionMasivaPlantilla.update({
                where: {
                    id: plantillaId,
                },
                data: {
                    nombre: nombre.trim(),
                    descripcion: descripcion?.trim() || null,
                    items: {
                        create: productosValidos.map((producto) => ({
                            productoId: producto.productoId,
                        })),
                    },
                    entidades: {
                        create: entidadesValidas.map((entidad) => ({
                            entidadId: entidad.entidadId,
                            cantidades: {
                                create: entidad.cantidades.map((cantidad) => ({
                                    productoId: cantidad.productoId,
                                    cantidad: cantidad.cantidad,
                                })),
                            },
                        })),
                    },
                },
            });
        }, {
            timeout: 15000,
            maxWait: 10000,
        });
        const plantillaActualizada = await prisma.cotizacionMasivaPlantilla.findUnique({
            where: {
                id: plantillaId,
            },
            include: {
                tecnico: {
                    select: {
                        id_tecnico: true,
                        nombre: true,
                        email: true,
                    },
                },
                items: {
                    include: {
                        producto: true,
                    },
                },
                entidades: {
                    include: {
                        entidad: true,
                        cantidades: {
                            include: {
                                producto: true,
                            },
                        },
                    },
                },
                ejecuciones: {
                    orderBy: {
                        fecha: "desc",
                    },
                    take: 3,
                },
            },
        });
        return res.json({
            ok: true,
            message: "Plantilla masiva actualizada correctamente.",
            data: plantillaActualizada,
        });
    }
    catch (error) {
        console.error("❌ Error actualizarPlantillaMasiva:", error);
        return res.status(500).json({
            error: error?.message || "Error al actualizar plantilla masiva.",
        });
    }
}
export async function desactivarPlantillaMasiva(req, res) {
    try {
        const plantillaId = Number(req.params.id);
        if (!plantillaId) {
            return res.status(400).json({
                error: "ID de plantilla inválido.",
            });
        }
        await prisma.cotizacionMasivaPlantilla.update({
            where: {
                id: plantillaId,
            },
            data: {
                activo: false,
            },
        });
        return res.json({
            ok: true,
            message: "Plantilla desactivada correctamente.",
        });
    }
    catch (error) {
        console.error("Error desactivarPlantillaMasiva:", error);
        return res.status(500).json({
            error: "Error al desactivar plantilla masiva.",
        });
    }
}
//# sourceMappingURL=cotizaciones-masivas.controller.js.map