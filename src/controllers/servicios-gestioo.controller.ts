import { PrismaClient } from "@prisma/client";
import type { Request, Response } from "express";

const prisma = new PrismaClient();

// ✅ Obtener todos los servicios
export async function getServicios(req: Request, res: Response) {
  try {
    const servicios = await prisma.servicioGestioo.findMany({
      orderBy: { id: "asc" }
    });

    res.json({ data: servicios });
  } catch (error) {
    console.error("❌ Error al obtener servicios:", error);
    res.status(500).json({ error: "Error al obtener servicios" });
  }
}

// ✅ Obtener servicio por ID
export async function getServicioById(req: Request, res: Response) {
  try {
    const id = Number(req.params.id);

    if (isNaN(id) || id <= 0) {
      return res.status(400).json({ error: "ID de servicio inválido" });
    }

    const servicio = await prisma.servicioGestioo.findUnique({
      where: { id }
    });

    if (!servicio) return res.status(404).json({ error: "Servicio no encontrado" });

    res.json({ data: servicio });
  } catch (error) {
    console.error("❌ Error al obtener servicio:", error);
    res.status(500).json({ error: "Error al obtener servicio" });
  }
}

// ✅ Crear servicio
export async function createServicio(req: Request, res: Response) {
  try {
    const { nombre, descripcion, precio, codigo, categoria } = req.body;

    if (!nombre || nombre.trim() === '') {
      return res.status(400).json({ error: "El nombre es obligatorio" });
    }

    const data = {
      nombre: nombre.trim(),
      descripcion: descripcion ? descripcion.trim() : null,
      precio: precio !== undefined ? Number(precio) : null,
      codigo: codigo || null,
      categoria: categoria || null,
      tipo: "servicio",
      estado: "disponible",
      activo: true,
    };

    const nuevoServicio = await prisma.servicioGestioo.create({
      data
    });

    res.status(201).json({ data: nuevoServicio });
  } catch (error: any) {
    console.error("❌ Error al crear servicio:", error);
    res.status(500).json({
      error: "Error al crear servicio",
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
}

// ✅ Actualizar servicio
export async function updateServicio(req: Request, res: Response) {
  try {
    const id = Number(req.params.id);

    if (isNaN(id) || id <= 0) {
      return res.status(400).json({ error: "ID de servicio inválido" });
    }

    const existe = await prisma.servicioGestioo.findUnique({
      where: { id }
    });

    if (!existe) {
      return res.status(404).json({ error: "Servicio no encontrado" });
    }

    const { nombre, descripcion, precio, codigo, categoria } = req.body;

    if (!nombre || nombre.trim() === '') {
      return res.status(400).json({ error: "El nombre es obligatorio" });
    }

    const data = {
      nombre: nombre.trim(),
      descripcion: descripcion ? descripcion.trim() : null,
      precio: precio !== undefined ? Number(precio) : null,
      codigo: codigo || null,
      categoria: categoria || null,
    };

    const servicioActualizado = await prisma.servicioGestioo.update({
      where: { id },
      data,
    });

    res.json({ data: servicioActualizado });
  } catch (error: any) {
    console.error("❌ Error al actualizar servicio:", error);

    if (error.code === 'P2025') {
      return res.status(404).json({ error: "Servicio no encontrado" });
    }

    res.status(500).json({
      error: "Error al actualizar servicio",
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
}

// ✅ Eliminar servicio
export async function deleteServicio(req: Request, res: Response) {
  try {
    const id = Number(req.params.id);

    if (isNaN(id) || id <= 0) {
      return res.status(400).json({ error: "ID de servicio inválido" });
    }

    await prisma.servicioGestioo.delete({ where: { id } });

    res.json({
      message: "✅ Servicio eliminado correctamente",
      data: { id }
    });
  } catch (error: any) {
    console.error("❌ Error al eliminar servicio:", error);

    if (error.code === 'P2025') {
      return res.status(404).json({ error: "Servicio no encontrado" });
    }

    res.status(500).json({ error: "Error al eliminar servicio" });
  }
}