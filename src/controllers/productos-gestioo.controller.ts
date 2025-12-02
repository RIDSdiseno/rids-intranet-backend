import fs from "fs/promises";
import path from "path";
import type { Request, Response } from "express";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

/* ======================================
   HELPERS
====================================== */
function calcularPrecioTotal(precio: number | null, porcGanancia: number | null): number | null {
    if (precio === null || precio === undefined) return null;
    if (porcGanancia === null || porcGanancia === undefined) return precio;

    const ganancia = precio * (porcGanancia / 100);
    return Math.round(precio + ganancia);
}

/* ======================================
   SEED
====================================== */
export async function seedProductos(_req: Request, res: Response) {
    try {
        const filePath = path.resolve("prisma/productos_seed.json");
        const fileContent = await fs.readFile(filePath, "utf8");
        const productos = JSON.parse(fileContent);

        const data = productos.map((p: any) => ({
            nombre: p.nombre,
            descripcion: p.descripcion ?? null,
            categoria: p.categoria,
            serie: p.serie ?? null,
            precio: Number(p.precio) || 0,
            stock: Number(p.stock) || 0,
            tipo: "producto",
            estado: p.estado ?? "disponible",
            activo: Boolean(p.activo),
            porcGanancia: null,
            precioTotal: Number(p.precio) || 0
        }));

        const result = await prisma.productoGestioo.createMany({
            data,
            skipDuplicates: true,
        });

        return res.status(201).json({
            message: `Se insertaron ${result.count} productos correctamente.`,
        });
    } catch (error) {
        console.error("❌ Error:", error);
        return res.status(500).json({ error: "Error al poblar productos" });
    }
}

/* ======================================
   CREATE PRODUCTO
====================================== */
export async function createProducto(req: Request, res: Response) {
    try {
        const {
            nombre,
            descripcion,
            precio,
            categoria,
            stock,
            porcGanancia
        } = req.body;

        if (!nombre?.trim()) {
            return res.status(400).json({ error: "El nombre es obligatorio" });
        }

        const precioNumero = precio !== undefined ? Number(precio) : null;
        const porcNumero = porcGanancia !== undefined ? Number(porcGanancia) : null;

        const precioTotal = calcularPrecioTotal(precioNumero, porcNumero);

        // 1️⃣ Crear producto sin serie
        const nuevo = await prisma.productoGestioo.create({
            data: {
                nombre: nombre.trim(),
                descripcion: descripcion?.trim() || null,
                precio: precioNumero,
                categoria: categoria || null,
                stock: stock !== undefined ? Number(stock) : 0,
                tipo: "producto",
                estado: "disponible",
                activo: true,
                porcGanancia: porcNumero,
                precioTotal
            }
        });

        // 2️⃣ Generar serie única usando el ID ya creado
        const serieGenerada = `PROD-${nuevo.id.toString().padStart(4, "0")}`;

        // 3️⃣ Actualizar solo la serie
        const actualizado = await prisma.productoGestioo.update({
            where: { id: nuevo.id },
            data: { serie: serieGenerada }
        });

        // 4️⃣ Retornar el producto final
        return res.status(201).json({ data: actualizado });

    } catch (error: any) {
        console.error("❌ Error al crear producto:", error);
        return res.status(500).json({
            error: "Error al crear producto",
            details: error.message
        });
    }
}


/* ======================================
   GET ALL
====================================== */
export async function getProductos(_req: Request, res: Response) {
    try {
        const productos = await prisma.productoGestioo.findMany({
            orderBy: { id: "asc" }
        });

        return res.json({ data: productos });

    } catch (error) {
        console.error("❌ Error:", error);
        return res.status(500).json({ error: "Error al obtener productos" });
    }
}

/* ======================================
   GET BY ID
====================================== */
export async function getProductoById(req: Request, res: Response) {
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

    } catch (error) {
        console.error("❌ Error:", error);
        return res.status(500).json({ error: "Error al obtener producto" });
    }
}

/* ======================================
   UPDATE
====================================== */
export async function updateProducto(req: Request, res: Response) {
    try {
        const id = Number(req.params.id);

        if (isNaN(id)) {
            return res.status(400).json({ error: "ID inválido" });
        }

        const existe = await prisma.productoGestioo.findUnique({ where: { id } });
        if (!existe) {
            return res.status(404).json({ error: "Producto no encontrado" });
        }

        const {
            nombre,
            descripcion,
            precio,
            categoria,
            stock,
            serie,
            porcGanancia
        } = req.body;

        if (!nombre?.trim()) {
            return res.status(400).json({ error: "El nombre es obligatorio" });
        }

        const precioNumero = precio !== undefined ? Number(precio) : existe.precio;
        const porcNumero = porcGanancia !== undefined ? Number(porcGanancia) : existe.porcGanancia;

        const precioTotal = calcularPrecioTotal(precioNumero, porcNumero);

        const data = {
            nombre: nombre.trim(),
            descripcion: descripcion?.trim() || null,
            precio: precioNumero,
            categoria: categoria || null,
            stock: stock !== undefined ? Number(stock) : existe.stock,
            serie: serie || null,
            porcGanancia: porcNumero,
            precioTotal
        };

        const actualizado = await prisma.productoGestioo.update({
            where: { id },
            data
        });

        return res.json({ data: actualizado });

    } catch (error: any) {
        console.error("❌ Error al actualizar producto:", error);
        return res.status(500).json({
            error: "Error al actualizar producto",
            details: error.message
        });
    }
}

/* ======================================
   DELETE
====================================== */
export async function deleteProducto(req: Request, res: Response) {
    try {
        const id = Number(req.params.id);

        if (isNaN(id)) {
            return res.status(400).json({ error: "ID inválido" });
        }

        await prisma.productoGestioo.delete({ where: { id } });

        return res.json({
            message: "Producto eliminado correctamente",
            data: { id }
        });

    } catch (error) {
        console.error("❌ Error:", error);
        return res.status(500).json({ error: "Error al eliminar producto" });
    }
}
