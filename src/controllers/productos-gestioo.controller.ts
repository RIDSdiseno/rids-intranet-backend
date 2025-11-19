import fs from "fs/promises";
import path from "path";
import type { Request, Response } from "express";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

export async function seedProductos(req: Request, res: Response) {
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
        }));

        const result = await prisma.productoGestioo.createMany({
            data,
            skipDuplicates: true,
        });

        res.status(201).json({
            message: `✅ Se insertaron ${result.count} productos correctamente.`,
        });
    } catch (error) {
        console.error("❌ Error al poblar productos:", error);
        res.status(500).json({
            error: "Error al poblar productos",
            detalles: (error as Error).message,
        });
    }
}

/* =====================================================
   CRUD: PRODUCTOGESTIOO - CORREGIDO
===================================================== */

// ✅ Crear producto - CORREGIDO
export async function createProducto(req: Request, res: Response) {
    try {
        const { nombre, descripcion, precio, categoria, stock, serie } = req.body;

        if (!nombre || nombre.trim() === '') {
            return res.status(400).json({ error: "El nombre es obligatorio" });
        }

        const data = {
            nombre: nombre.trim(),
            descripcion: descripcion ? descripcion.trim() : null,
            precio: precio !== undefined ? Number(precio) : null,
            categoria: categoria || null,
            stock: stock !== undefined ? Number(stock) : null,
            serie: serie || null,
            tipo: "producto",
            estado: "disponible",
            activo: true,
        };

        const nuevoProducto = await prisma.productoGestioo.create({
            data
        });

        res.status(201).json({ data: nuevoProducto });
    } catch (error: any) {
        console.error("❌ Error al crear producto:", error);
        res.status(500).json({ error: "Error al crear producto", details: error.message });
    }
}


// ✅ Obtener todos los productos - CORREGIDO
export async function getProductos(req: Request, res: Response) {
    try {
        const productos = await prisma.productoGestioo.findMany({
            orderBy: { id: "asc" }
        });

        res.json({ data: productos }); // Cambiado a formato { data: ... }
    } catch (error) {
        console.error("❌ Error al obtener productos:", error);
        res.status(500).json({ error: "Error al obtener productos" });
    }
}

// ✅ Obtener producto por ID - CORREGIDO
export async function getProductoById(req: Request, res: Response) {
    try {
        const id = Number(req.params.id);

        if (isNaN(id) || id <= 0) {
            return res.status(400).json({ error: "ID de producto inválido" });
        }

        const producto = await prisma.productoGestioo.findUnique({
            where: { id }
        });

        if (!producto) return res.status(404).json({ error: "Producto no encontrado" });

        res.json({ data: producto }); // Cambiado a formato { data: ... }
    } catch (error) {
        console.error("❌ Error al obtener producto:", error);
        res.status(500).json({ error: "Error al obtener producto" });
    }
}

// ✅ Actualizar producto - CORREGIDO
export async function updateProducto(req: Request, res: Response) {
    try {
        const id = Number(req.params.id);

        if (isNaN(id) || id <= 0) {
            return res.status(400).json({ error: "ID de producto inválido" });
        }

        const existe = await prisma.productoGestioo.findUnique({
            where: { id }
        });

        if (!existe) {
            return res.status(404).json({ error: "Producto no encontrado" });
        }

        const { nombre, descripcion, precio, categoria, stock, serie } = req.body;

        if (!nombre || nombre.trim() === '') {
            return res.status(400).json({ error: "El nombre es obligatorio" });
        }

        const data = {
            nombre: nombre.trim(),
            descripcion: descripcion ? descripcion.trim() : null,
            precio: precio !== undefined ? Number(precio) : null,
            categoria: categoria || null,
            stock: stock !== undefined ? Number(stock) : null,
            serie: serie || null,
        };

        const productoActualizado = await prisma.productoGestioo.update({
            where: { id },
            data,
        });

        res.json({ data: productoActualizado });
    } catch (error: any) {
        console.error("❌ Error al actualizar producto:", error);

        if (error.code === 'P2025') {
            return res.status(404).json({ error: "Producto no encontrado" });
        }

        res.status(500).json({
            error: "Error al actualizar producto",
            details: error.message
        });
    }
}


// ✅ Eliminar producto - CORREGIDO
export async function deleteProducto(req: Request, res: Response) {
    try {
        const id = Number(req.params.id);

        if (isNaN(id) || id <= 0) {
            return res.status(400).json({ error: "ID de producto inválido" });
        }

        await prisma.productoGestioo.delete({ where: { id } });

        res.json({
            message: "✅ Producto eliminado correctamente",
            data: { id }
        });
    } catch (error: any) {
        console.error("❌ Error al eliminar producto:", error);

        if (error.code === 'P2025') {
            return res.status(404).json({ error: "Producto no encontrado" });
        }

        res.status(500).json({ error: "Error al eliminar producto" });
    }
}