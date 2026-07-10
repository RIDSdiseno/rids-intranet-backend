// src/controllers/productos-gestioo.controller.ts
import fs from "fs/promises";
import path from "path";
import { PrismaClient } from "@prisma/client";
import cloudinary from "../config/cloudinary.js";
const prisma = new PrismaClient();
/* ======================================
   HELPERS
====================================== */
function calcularPrecioTotal(precioCosto, porcGanancia) {
    if (precioCosto === null || precioCosto === undefined)
        return null;
    if (porcGanancia === null || porcGanancia === undefined)
        return precioCosto;
    const ganancia = precioCosto * (porcGanancia / 100);
    return Math.round(precioCosto + ganancia);
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
        const { nombre, descripcion, precio, // puede venir viejo (costo)
        precioCosto, // nuevo campo recomendado
        categoria, stock, porcGanancia, imagen, serie, conIVA, } = req.body;
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
        // COSTO REAL: priorizamos precioCosto, si no viene usamos precio
        const costoReal = precioCosto !== undefined && precioCosto !== null
            ? Number(precioCosto)
            : precio !== undefined && precio !== null
                ? Number(precio)
                : null;
        const porcNumero = porcGanancia !== undefined && porcGanancia !== null
            ? Number(porcGanancia)
            : null;
        const aplicaIVA = conIVA === true || conIVA === "true";
        const costoBase = costoReal !== null
            ? (aplicaIVA ? costoReal / 1.19 : costoReal)
            : null;
        const precioTotal = calcularPrecioTotal(costoBase, porcNumero);
        // Crear producto
        const nuevo = await prisma.productoGestioo.create({
            data: {
                nombre: nombreLimpio,
                descripcion: descripcion?.trim() || null,
                //Guardamos siempre el COSTO en "precio"
                precio: costoReal,
                categoria: categoria || null,
                stock: stock !== undefined ? Number(stock) : 0,
                tipo: "producto",
                estado: "disponible",
                activo: true,
                porcGanancia: porcNumero,
                // Guardamos la venta final en "precioTotal"
                precioTotal: precioTotal,
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
        const { nombre, descripcion, precio, // puede venir como antes
        precioCosto, // nuevo campo desde front
        categoria, stock, serie, porcGanancia, imagen, publicId, conIVA, } = req.body;
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
        const costoReal = precioCosto !== undefined && precioCosto !== null
            ? Number(precioCosto)
            : precio !== undefined && precio !== null
                ? Number(precio)
                : (existe.precio ?? 0);
        const porcNumero = porcGanancia !== undefined && porcGanancia !== null
            ? Number(porcGanancia)
            : existe.porcGanancia;
        const aplicaIVA = conIVA === true || conIVA === "true";
        const costoBase = aplicaIVA ? costoReal / 1.19 : costoReal;
        const precioTotal = calcularPrecioTotal(costoBase, porcNumero);
        const data = {
            nombre: nombreLimpio,
            descripcion: descripcion?.trim() || null,
            // Guardamos costo real en "precio"
            precio: costoReal,
            categoria: categoria || null,
            stock: stock !== undefined && stock !== null
                ? Number(stock)
                : existe.stock,
            serie: serie || existe.serie,
            porcGanancia: porcNumero,
            // Guardamos venta final en "precioTotal"
            precioTotal: precioTotal,
            imagen: imagen === undefined || imagen === ""
                ? existe.imagen // NO BORRAR si no viene nada
                : imagen,
            publicId: publicId === undefined || publicId === ""
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