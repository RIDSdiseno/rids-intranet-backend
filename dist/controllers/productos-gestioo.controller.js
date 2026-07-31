// src/controllers/productos-gestioo.controller.ts
import fs from "fs/promises";
import path from "path";
import cloudinary from "../config/cloudinary.js";
import { prismaBase as prisma } from "../lib/prisma.js";
/* ======================================
   HELPERS
====================================== */
/**
 * Convierte un valor recibido por la API a número decimal.
 *
 * Admite:
 * 140
 * 140.5
 * "140.5"
 * "140,5"
 */
function parseDecimalInput(value, fallback = null) {
    if (value === null ||
        value === undefined ||
        value === "") {
        return fallback;
    }
    if (typeof value === "number") {
        return Number.isFinite(value)
            ? value
            : fallback;
    }
    const normalized = String(value)
        .trim()
        .replace(",", ".");
    const parsed = Number(normalized);
    return Number.isFinite(parsed)
        ? parsed
        : fallback;
}
/**
 * Redondea valores monetarios manteniendo
 * como máximo dos decimales.
 */
function redondearDinero(value) {
    if (!Number.isFinite(value)) {
        return 0;
    }
    return Math.round((value + Number.EPSILON) * 100) / 100;
}
/**
 * Normaliza porcentajes de ganancia.
 *
 * No se limita a 100 porque un producto
 * puede tener una ganancia superior al 100%.
 */
function normalizarPorcentajeGanancia(value) {
    const parsed = parseDecimalInput(value, null);
    if (parsed === null) {
        return null;
    }
    return Math.max(0, redondearDinero(parsed));
}
/**
 * Calcula el precio final conservando
 * hasta dos decimales.
 */
function calcularPrecioTotal(precioCosto, porcGanancia) {
    if (precioCosto === null) {
        return null;
    }
    if (porcGanancia === null) {
        return redondearDinero(precioCosto);
    }
    return redondearDinero(precioCosto *
        (1 +
            porcGanancia / 100));
}
/**
 * Mantiene el stock como entero no negativo.
 */
function normalizarStock(value, fallback = 0) {
    const parsed = parseDecimalInput(value, fallback);
    return Math.max(0, Math.trunc(parsed ?? fallback));
}
function normalizarNombreProducto(value) {
    return value.trim().replace(/\s+/g, " ");
}
function normalizarNombreComparacion(value) {
    return value
        .trim()
        .replace(/\s+/g, " ")
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase();
}
const MAX_DESCRIPCION_PRODUCTO = 150;
function normalizarDescripcionProducto(value) {
    return String(value ?? "").trim().slice(0, MAX_DESCRIPCION_PRODUCTO);
}
async function buscarProductoDuplicadoPorNombre(nombre, productoIdExcluir) {
    const nombreComparacion = normalizarNombreComparacion(nombre);
    const productosActivos = await prisma.productoGestioo.findMany({
        where: {
            activo: true,
            ...(productoIdExcluir
                ? {
                    id: {
                        not: productoIdExcluir,
                    },
                }
                : {}),
        },
        select: {
            id: true,
            nombre: true,
            serie: true,
            stock: true,
            estado: true,
            activo: true,
        },
    });
    return productosActivos.find((producto) => {
        return normalizarNombreComparacion(producto.nombre) === nombreComparacion;
    });
}
/* ======================================
   SEED
====================================== */
export async function seedProductos(_req, res) {
    try {
        const filePath = path.resolve("prisma/productos_seed.json");
        const fileContent = await fs.readFile(filePath, "utf8");
        const productos = JSON.parse(fileContent);
        const data = productos.map((p) => {
            const precioCosto = Number(p.precio) || 0;
            const porcGanancia = p.porcGanancia != null ? Number(p.porcGanancia) : null;
            const precioTotal = calcularPrecioTotal(precioCosto, porcGanancia);
            return {
                nombre: p.nombre,
                descripcion: p.descripcion ?? null,
                categoria: p.categoria,
                serie: p.serie ?? null,
                // 👉 precio = COSTO REAL
                precio: precioCosto,
                stock: Number(p.stock) || 0,
                tipo: "producto",
                estado: p.estado ?? "disponible",
                activo: Boolean(p.activo),
                porcGanancia: porcGanancia,
                // 👉 precioTotal = VENTA FINAL
                precioTotal: precioTotal ?? precioCosto,
                imagen: p.imagen ?? null,
                publicId: p.publicId ?? null,
            };
        });
        const result = await prisma.productoGestioo.createMany({
            data,
            skipDuplicates: true,
        });
        return res.status(201).json({
            message: `Se insertaron ${result.count} productos correctamente.`,
        });
    }
    catch (error) {
        console.error("❌ Error:", error);
        return res.status(500).json({ error: "Error al poblar productos" });
    }
}
/* ======================================
   CREATE PRODUCTO
====================================== */
export async function createProducto(req, res) {
    try {
        const { nombre, descripcion, 
        /*
         * precio puede ser utilizado por el frontend
         * antiguo como precio de costo.
         */
        precio, 
        /*
         * Campo explícito para costo.
         */
        precioCosto, 
        /*
         * Precio final calculado o editado
         * manualmente desde el frontend.
         */
        precioTotal, categoria, stock, porcGanancia, imagen, serie, conIVA, } = req.body;
        const nombreLimpio = normalizarNombreProducto(String(nombre ?? ""));
        if (!nombreLimpio) {
            return res.status(400).json({
                error: "El nombre es obligatorio",
            });
        }
        const productoDuplicado = await buscarProductoDuplicadoPorNombre(nombreLimpio);
        if (productoDuplicado) {
            return res.status(409).json({
                error: "Ya existe un producto activo con ese nombre.",
                message: "Ya existe un producto activo con ese nombre.",
                producto: productoDuplicado,
            });
        }
        /*
 * Costo ingresado por el usuario.
 *
 * Se prioriza precioCosto para mantener
 * compatibilidad con el nuevo frontend.
 */
        const costoReal = parseDecimalInput(precioCosto ??
            precio, null);
        if (costoReal === null ||
            costoReal <= 0) {
            return res.status(400).json({
                error: "El precio de costo debe ser mayor a 0.",
            });
        }
        const costoRealRedondeado = redondearDinero(costoReal);
        const porcNumero = normalizarPorcentajeGanancia(porcGanancia);
        const aplicaIVA = conIVA === true ||
            conIVA === "true";
        /*
         * Cuando el costo ingresado incluye IVA,
         * se extrae el valor neto para calcular
         * la ganancia.
         */
        const costoBase = redondearDinero(aplicaIVA
            ? costoRealRedondeado /
                1.19
            : costoRealRedondeado);
        /*
         * Se respeta primero el precio final enviado
         * por el frontend, porque puede haber sido
         * modificado manualmente por el usuario.
         *
         * Solo se recalcula cuando no fue enviado.
         */
        const precioTotalRecibido = parseDecimalInput(precioTotal, null);
        const precioVentaFinal = precioTotalRecibido !== null &&
            precioTotalRecibido > 0
            ? redondearDinero(precioTotalRecibido)
            : calcularPrecioTotal(costoBase, porcNumero);
        // Crear producto
        const nuevo = await prisma.productoGestioo.create({
            data: {
                nombre: nombreLimpio,
                descripcion: normalizarDescripcionProducto(descripcion),
                /*
                 * En la base de datos, precio representa
                 * el costo ingresado por el usuario.
                 */
                precio: costoRealRedondeado,
                categoria: categoria || null,
                /*
                 * Stock sigue siendo un número entero.
                 */
                stock: normalizarStock(stock, 0),
                tipo: "producto",
                estado: "disponible",
                activo: true,
                porcGanancia: porcNumero,
                /*
                 * Precio de venta con hasta dos decimales.
                 */
                precioTotal: precioVentaFinal,
                imagen: imagen ?? null,
                serie: serie || null,
            },
        });
        // Si no vino serie, generar una
        if (!serie) {
            const serieGenerada = `PROD-${nuevo.id.toString().padStart(4, "0")}`;
            const actualizado = await prisma.productoGestioo.update({
                where: { id: nuevo.id },
                data: { serie: serieGenerada },
            });
            return res.status(201).json({ data: actualizado });
        }
        return res.status(201).json({ data: nuevo });
    }
    catch (error) {
        console.error("❌ Error al crear producto:", error);
        return res.status(500).json({
            error: "Error al crear producto",
            details: error.message,
        });
    }
}
/* ======================================
   GET ALL
====================================== */
export async function getProductos(_req, res) {
    try {
        const productos = await prisma.productoGestioo.findMany({
            orderBy: { id: "asc" },
        });
        return res.json({ data: productos });
    }
    catch (error) {
        console.error("❌ Error:", error);
        return res.status(500).json({ error: "Error al obtener productos" });
    }
}
/* ======================================
   GET BY ID
====================================== */
export async function getProductoById(req, res) {
    try {
        const id = Number(req.params.id);
        if (isNaN(id)) {
            return res.status(400).json({ error: "ID inválido" });
        }
        const producto = await prisma.productoGestioo.findUnique({ where: { id } });
        if (!producto) {
            return res.status(404).json({ error: "Producto no encontrado" });
        }
        return res.json({ data: producto });
    }
    catch (error) {
        console.error("❌ Error:", error);
        return res.status(500).json({ error: "Error al obtener producto" });
    }
}
/* ======================================
   UPDATE
====================================== */
export async function updateProducto(req, res) {
    try {
        const id = Number(req.params.id);
        if (isNaN(id)) {
            return res.status(400).json({ error: "ID inválido" });
        }
        const existe = await prisma.productoGestioo.findUnique({ where: { id } });
        if (!existe) {
            return res.status(404).json({ error: "Producto no encontrado" });
        }
        const { nombre, descripcion, precio, precioCosto, precioTotal, categoria, stock, serie, porcGanancia, imagen, publicId, conIVA, } = req.body;
        const nombreLimpio = normalizarNombreProducto(String(nombre ?? ""));
        if (!nombreLimpio) {
            return res.status(400).json({
                error: "El nombre es obligatorio",
            });
        }
        const productoDuplicado = await buscarProductoDuplicadoPorNombre(nombreLimpio, id);
        if (productoDuplicado) {
            return res.status(409).json({
                error: "Ya existe otro producto activo con ese nombre.",
                message: "Ya existe otro producto activo con ese nombre.",
                producto: productoDuplicado,
            });
        }
        // COSTO REAL: priorizamos precioCosto, luego precio, luego lo que ya está en BD
        const costoReal = parseDecimalInput(precioCosto ??
            precio ??
            existe.precio, 0) ?? 0;
        if (costoReal <= 0) {
            return res.status(400).json({
                error: "El precio de costo debe ser mayor a 0.",
            });
        }
        const costoRealRedondeado = redondearDinero(costoReal);
        const porcNumero = porcGanancia !== undefined &&
            porcGanancia !== null
            ? normalizarPorcentajeGanancia(porcGanancia)
            : existe.porcGanancia;
        const aplicaIVA = conIVA === true ||
            conIVA === "true";
        const costoBase = redondearDinero(aplicaIVA
            ? costoRealRedondeado /
                1.19
            : costoRealRedondeado);
        const precioTotalRecibido = parseDecimalInput(precioTotal, null);
        /*
         * Si el frontend envió un precio de venta,
         * se conserva. Si no lo envió, se recalcula.
         */
        const precioVentaFinal = precioTotalRecibido !== null &&
            precioTotalRecibido > 0
            ? redondearDinero(precioTotalRecibido)
            : calcularPrecioTotal(costoBase, porcNumero);
        const data = {
            nombre: nombreLimpio,
            descripcion: descripcion !== undefined
                ? normalizarDescripcionProducto(descripcion)
                : normalizarDescripcionProducto(existe.descripcion),
            precio: costoRealRedondeado,
            categoria: categoria || null,
            stock: stock !== undefined &&
                stock !== null
                ? normalizarStock(stock, existe.stock ?? 0)
                : existe.stock,
            serie: serie || existe.serie,
            porcGanancia: porcNumero,
            precioTotal: precioVentaFinal,
            imagen: imagen === undefined ||
                imagen === ""
                ? existe.imagen
                : imagen,
            publicId: publicId === undefined ||
                publicId === ""
                ? existe.publicId
                : publicId,
        };
        const actualizado = await prisma.productoGestioo.update({
            where: { id },
            data,
        });
        return res.json({ data: actualizado });
    }
    catch (error) {
        console.error("❌ Error al actualizar producto:", error);
        return res.status(500).json({
            error: "Error al actualizar producto",
            details: error.message,
        });
    }
}
/* ======================================
   DELETE PRODUCTO + eliminar imagen Cloudinary
====================================== */
export async function deleteProducto(req, res) {
    try {
        const id = Number(req.params.id);
        if (isNaN(id)) {
            return res.status(400).json({ error: "ID inválido" });
        }
        // Buscar producto en BD
        const producto = await prisma.productoGestioo.findUnique({ where: { id } });
        if (!producto) {
            return res.status(404).json({ error: "Producto no encontrado" });
        }
        // Si tiene imagen en Cloudinary → eliminarla
        if (producto.publicId) {
            try {
                console.log("🗑 Eliminando imagen Cloudinary:", producto.publicId);
                const result = await cloudinary.uploader.destroy(producto.publicId);
                console.log("Cloudinary →", result);
            }
            catch (error) {
                console.warn("⚠ No se pudo eliminar imagen en Cloudinary:", error);
            }
        }
        // Eliminar producto de la BD
        await prisma.productoGestioo.delete({ where: { id } });
        return res.json({
            message: "Producto eliminado correctamente",
            deletedId: id,
        });
    }
    catch (error) {
        console.error("❌ Error al eliminar producto:", error);
        return res.status(500).json({
            error: "Error al eliminar producto",
            details: error.message,
        });
    }
}
//# sourceMappingURL=productos-gestioo.controller.js.map