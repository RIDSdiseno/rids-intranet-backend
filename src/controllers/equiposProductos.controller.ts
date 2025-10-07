import type { Request, Response } from "express";
import { prisma } from "../lib/prisma.js";
import { z } from "zod";

//  Esquema de validación
const productoSchema = z.object({
  nombre: z.string(),
  descripcion: z.string().nullable().optional(),
  precio: z.coerce.number().positive(),
  stock: z.coerce.number().int().nonnegative(),
  marca: z.string(),
  modelo: z.string(),
  estado: z.string(),
});

//  Esquema parcial para updates (permite campos opcionales)
const productoUpdateSchema = productoSchema.partial();

// =====================
// CREATE
// =====================
export async function createProducto(req: Request, res: Response) {
  try {
    const data = productoSchema.parse(req.body);

    const dataWithDescripcion = {
      ...data,
      descripcion: data.descripcion ?? null,
    };

    const nuevo = await prisma.equipoProducto.create({ data: dataWithDescripcion });

    return res.status(201).json(nuevo);
  } catch (error: any) {
    console.error("Error al crear producto", error);
    return res.status(500).json({ error: "Error al crear producto" });
  }
}

// =====================
// READ ALL
// =====================
export async function getProductos(req: Request, res: Response) {
  try {
    const productos = await prisma.equipoProducto.findMany({
      orderBy: { id: "asc" },
    });
    return res.status(200).json(productos);
  } catch (error: any) {
    console.error("Error al obtener productos", error);
    return res.status(500).json({ error: "Error al obtener productos" });
  }
}

// =====================
//  READ ONE
// =====================
export async function getProductoById(req: Request, res: Response) {
  try {
    const id = Number(req.params.id);
    if (isNaN(id)) return res.status(400).json({ error: "ID inválido" });

    const producto = await prisma.equipoProducto.findUnique({ where: { id } });

    if (!producto) {
      return res.status(404).json({ error: "Producto no encontrado" });
    }

    return res.status(200).json(producto);
  } catch (error: any) {
    console.error("Error al obtener producto", error);
    return res.status(500).json({ error: "Error al obtener producto" });
  }
}

// =====================
//  UPDATE
// =====================
export async function updateProducto(req: Request, res: Response) {
  try {
    const id = Number(req.params.id);
    if (isNaN(id)) return res.status(400).json({ error: "ID inválido" });

    const data = productoUpdateSchema.parse(req.body);

    // Only include fields that are defined, and use Prisma's field update operators
    const dataWithOperators: any = {};
    if (data.nombre !== undefined) dataWithOperators.nombre = { set: data.nombre };
    if (data.descripcion !== undefined) dataWithOperators.descripcion = { set: data.descripcion ?? null };
    if (data.precio !== undefined) dataWithOperators.precio = { set: data.precio };
    if (data.stock !== undefined) dataWithOperators.stock = { set: data.stock };
    if (data.marca !== undefined) dataWithOperators.marca = { set: data.marca };
    if (data.modelo !== undefined) dataWithOperators.modelo = { set: data.modelo };
    if (data.estado !== undefined) dataWithOperators.estado = { set: data.estado };

    const actualizado = await prisma.equipoProducto.update({
      where: { id },
      data: dataWithOperators,
    });

    return res.status(200).json(actualizado);
  } catch (error: any) {
    console.error("Error al actualizar producto", error);

    if (error.code === "P2025") {
      // Prisma: registro no encontrado
      return res.status(404).json({ error: "Producto no encontrado" });
    }

    return res.status(500).json({ error: "Error al actualizar producto" });
  }
}

// =====================
//  DELETE
// =====================
export async function deleteProducto(req: Request, res: Response) {
  try {
    const id = Number(req.params.id);
    if (isNaN(id)) return res.status(400).json({ error: "ID inválido" });

    await prisma.equipoProducto.delete({ where: { id } });

    return res.status(204).send(); // No content
  } catch (error: any) {
    console.error("Error al eliminar producto", error);

    if (error.code === "P2025") {
      return res.status(404).json({ error: "Producto no encontrado" });
    }

    return res.status(500).json({ error: "Error al eliminar producto" });
  }
}
