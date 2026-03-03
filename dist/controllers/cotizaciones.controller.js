import { PrismaClient } from "@prisma/client";
import { EstadoCotizacionGestioo, EstadoDTE } from "@prisma/client";
import { getSimpleAPIConfig, generarDTE, generarSobre, enviarAlSII, consultarEstadoEnvio } from "../service/simple-api/simpleapi.service.js";
const prisma = new PrismaClient();
function generarSKU() {
    const random = Math.floor(100000 + Math.random() * 900000); // 6 dígitos
    return `SKU-${random}`;
}
function mapEstadoSimpleAPIToEnum(estado) {
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
export async function getCotizacionesPaginadas(req, res) {
    try {
        const page = Math.max(1, Number(req.query.page) || 1);
        const limitRaw = Number(req.query.limit) || 15;
        const limit = Math.min(Math.max(1, limitRaw), 100);
        const skip = (page - 1) * limit;
        const { fechaDesde, fechaHasta, search, estado, tipo, origen, tecnico } = req.query;
        const AND = [];
        /* ==========================
           FILTRO POR FECHAS
        ========================== */
        if (fechaDesde || fechaHasta) {
            const fechaFilter = {};
            if (fechaDesde)
                fechaFilter.gte = new Date(String(fechaDesde));
            if (fechaHasta)
                fechaFilter.lte = new Date(String(fechaHasta));
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
            const searchUpper = searchValue.toUpperCase();
            const OR = [];
            // Buscar por ID si es número
            if (!isNaN(Number(searchValue))) {
                OR.push({ id: Number(searchValue) });
            }
            // Buscar por estado (enum exact match)
            const estadosMatch = Object.values(EstadoCotizacionGestioo).filter(e => e.toLowerCase().includes(searchValue.toLowerCase()));
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
                    facturas: {
                        select: {
                            id_factura: true,
                            folioSII: true,
                            tipoDTE: true,
                            numeroFactura: true,
                            estado: true,
                            fechaEmision: true,
                            total: true
                        }
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
    }
    catch (error) {
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
function normalizeCotizacionData(body) {
    const out = {};
    if (body.tipo)
        out.tipo = body.tipo;
    if (body.estado)
        out.estado = body.estado;
    if (body.entidadId !== undefined) {
        out.entidadId =
            body.entidadId === "" || body.entidadId === null
                ? null
                : Number(body.entidadId);
    }
    // nuevos campos
    if (body.subtotal !== undefined)
        out.subtotal = Number(body.subtotal);
    if (body.descuentos !== undefined)
        out.descuentos = Number(body.descuentos);
    if (body.iva !== undefined)
        out.iva = Number(body.iva);
    if (body.total !== undefined)
        out.total = Number(body.total);
    if (body.moneda)
        out.moneda = body.moneda;
    // <--- CORRECCIÓN FINAL
    if (body.tasaCambio !== undefined)
        out.tasaCambio = Number(body.tasaCambio);
    if (body.fecha)
        out.fecha = new Date(body.fecha);
    if (body.comentariosCotizacion !== undefined)
        out.comentariosCotizacion = body.comentariosCotizacion;
    return out;
}
/* =====================================================
      GET ALL - ASEGURAR INCLUSIÓN DE ITEMS
===================================================== */
export async function getCotizaciones(req, res) {
    try {
        const { fechaDesde, fechaHasta } = req.query;
        const where = {};
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
    }
    catch (error) {
        console.error(error);
        res.status(500).json({ error: "Error al obtener cotizaciones" });
    }
}
/* =====================================================
      GET BY ID - ASEGURAR INCLUSIÓN DE ITEMS
===================================================== */
export async function getCotizacionById(req, res) {
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
        return res.json({ data: cotConItems }); // ← RETURN agregado
    }
    catch (error) {
        console.error("❌ Error getCotizacionById:", error);
        return res.status(500).json({ error: "Error al obtener cotización" }); // ← RETURN agregado
    }
}
/* =====================================================
      CREATE
===================================================== */
export async function createCotizacion(req, res) {
    try {
        const user = req.user;
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
                    create: items.map((i) => {
                        const precioCLP = Number(i.precioOriginalCLP ?? i.precio ?? 0);
                        return {
                            tipo: i.tipo,
                            // 🔤 TEXTO
                            nombre: i.nombre?.trim() ?? i.descripcion?.trim() ?? "",
                            descripcion: i.descripcion?.trim() && i.descripcion.trim() !== ""
                                ? i.descripcion.trim()
                                : "", // <-- Cambiar null por string vacío
                            cantidad: Number(i.cantidad ?? 1),
                            // 🔥 PRECIO REAL (CLP)
                            precio: precioCLP,
                            precioOriginalCLP: precioCLP,
                            // COSTOS
                            precioCosto: i.precioCosto != null ? Number(i.precioCosto) : null,
                            porcGanancia: i.porcGanancia != null ? Number(i.porcGanancia) : null,
                            // DESCUENTOS
                            tieneDescuento: Boolean(i.tieneDescuento),
                            porcentaje: i.tieneDescuento
                                ? Number(i.porcentaje ?? 0)
                                : 0,
                            // IVA
                            tieneIVA: Boolean(i.tieneIVA),
                            // OTROS
                            sku: i.sku && i.sku.trim() !== ""
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
    }
    catch (error) {
        console.error("❌ Error createCotizacion:", error);
        return res.status(500).json({ error: "Error al crear cotización" });
    }
}
/* =====================================================
      UPDATE
===================================================== */
export async function updateCotizacion(req, res) {
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
                        create: items.map((i) => ({
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
                tecnico: {
                    select: {
                        id_tecnico: true,
                        nombre: true,
                        email: true,
                    },
                },
            },
        });
        return res.json({ data: updated });
    }
    catch (error) {
        console.error("❌ Error updateCotizacion:", error);
        return res.status(500).json({ error: "Error al actualizar cotización" });
    }
}
/* =====================================================
      DELETE
===================================================== */
export async function deleteCotizacion(req, res) {
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
    }
    catch (error) {
        console.error("❌ Error deleteCotizacion:", error);
        res.status(500).json({ error: "Error al eliminar cotización" });
    }
    return;
}
// =====================================================
//      FACTURAR COTIZACIÓN - CREAR FACTURA + CAMBIAR ESTADO
// =====================================================
export async function facturarCotizacion(req, res) {
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
    }
    catch (error) {
        console.error(error);
        res.status(500).json({ error: "Error interno al facturar" });
    }
    return;
}
// =====================================================
//      PAGAR FACTURA - SOLO SI NO ESTÁ ANULADA
// =====================================================
export async function anularFactura(req, res) {
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
    }
    catch (error) {
        console.error(error);
        res.status(500).json({ error: "Error al anular factura" });
    }
    return;
}
// =====================================================
//      PAGAR FACTURA - SOLO CAMBIAR ESTADO A PAGADA
// =====================================================
export async function pagarFactura(req, res) {
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
    }
    catch (error) {
        console.error(error);
        res.status(500).json({ error: "Error al pagar factura" });
    }
    return;
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
export async function cambiarEstadoFactura(req, res) {
    const { id } = req.params;
    const { estado } = req.body;
    try {
        const factura = await prisma.factura.update({
            where: { id_factura: Number(id) },
            data: { estadoSII: estado }
        });
        res.json(factura);
    }
    catch (error) {
        res.status(500).json({ error: "Error actualizando estado" });
    }
}
// =====================================================
//      INTEGRACIÓN SII - SIMPLE API
// =====================================================
// =====================================================
//      EMITIR FACTURA AL SII - SOLO PARA COTIZACIONES APROBADAS
// =====================================================
export async function emitirFacturaSII(req, res) {
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
        const config = getSimpleAPIConfig();
        if (!cotizacion.entidad) {
            return res.status(400).json({
                error: "La cotización no tiene entidad asociada"
            });
        }
        if (!cotizacion.entidad.rut) {
            return res.status(400).json({
                error: "La entidad no tiene RUT"
            });
        }
        const rutReceptor = String(cotizacion.entidad.rut).replace(/\./g, "").trim();
        // 1️⃣ Generar DTE
        const dte = await generarDTE(config, { cotizacion });
        // 2️⃣ Generar sobre
        await generarSobre(config, dte);
        // 3️⃣ Enviar al SII
        const envio = await enviarAlSII(config);
        // 4️⃣ Crear factura
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
        // 5️⃣ Ahora sí cambiar estado
        await prisma.cotizacionGestioo.update({
            where: { id: cotizacion.id },
            data: { estado: "FACTURADA" }
        });
        return res.json({
            message: "Factura emitida correctamente",
            folio: dte.folio,
            trackId: envio.trackId
        });
    }
    catch (error) {
        console.error(" Error emitirFacturaSII:", error);
        return res.status(500).json({ error: error.message });
    }
}
// =====================================================
//      CONSULTAR ESTADO ENVÍO SII - ACTUALIZAR ESTADO LOCAL
// =====================================================
export async function consultarEnvioSII(req, res) {
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
        const result = await consultarEstadoEnvio(config, factura.trackId);
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
    }
    catch (error) {
        console.error("❌ Error consultarEnvioSII:", error.message);
        return res.status(500).json({ error: error.message });
    }
}
// =====================================================
//      VINCULAR FACTURA SII EXISTENTE - SOLO PARA COTIZACIONES APROBADAS
// =====================================================
export async function vincularFacturaSII(req, res) {
    const { id } = req.params; // 🔥 CAMBIAR ESTO
    const { tipoDTE, folioSII, rutEmisor } = req.body;
    try {
        const cotizacion = await prisma.cotizacionGestioo.findUnique({
            where: { id: Number(id) }, // 🔥 USAR PARAM
            include: { entidad: true }
        });
        if (!cotizacion)
            return res.status(404).json({ error: "Cotización no encontrada" });
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
    }
    catch (error) {
        console.error("🔥 ERROR REAL:", error);
        return res.status(500).json({ error: error.message });
    }
}
// =====================================================
//      CONSULTAR ESTADO SII - ACTUALIZAR ESTADO LOCAL
// =====================================================
export async function consultarEstadoSII(req, res) {
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
        console.log("🔎 CONSULTA ENVIO:", {
            trackId: factura.trackId,
            ambiente: config.ambiente
        });
        const result = await consultarEstadoEnvio(config, factura.trackId);
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
    }
    catch (error) {
        console.error("❌ Error consultarEstadoSII:", error.message);
        return res.status(500).json({
            error: error.message ?? "Error consultando SII"
        });
    }
}
//# sourceMappingURL=cotizaciones.controller.js.map