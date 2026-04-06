// src/controllers/upload-imagenes.controller.ts
import type { Request, Response } from "express";
import { prisma } from "../lib/prisma.js";

// Controlador para subir imagenes a Cloudinary y asociarlas a productosGestioo
export async function uploadImagen(req: Request, res: Response) {
    try {
        const file = req.file;
        const { productoId } = req.body;

        // =========================
        // 1️⃣ Validación básica
        // =========================
        if (!file) {
            return res.status(400).json({
                message: "No se envió ninguna imagen.",
            });
        }

        console.log("✅ Imagen subida a Cloudinary:", file.path);

        // =========================
        // 2️⃣ Crear producto (sin productoId)
        // =========================
        if (!productoId) {
            return res.status(200).json({
                message: "Imagen subida correctamente",
                imagen: file.path,
                publicId: file.filename,
            });
        }

        // =========================
        // 3️⃣ Editar producto existente
        // =========================
        const productoIdNum = Number(productoId);

        if (isNaN(productoIdNum)) {
            return res.status(400).json({
                message: "ID de producto inválido.",
            });
        }

        const producto = await prisma.productoGestioo.update({
            where: { id: productoIdNum },
            data: {
                imagen: file.path,
                publicId: file.filename,
            },
        });

        return res.status(200).json({
            message: "Imagen actualizada correctamente",
            producto,
        });

    } catch (error: any) {
        console.error("❌ Error al subir imagen:", error);

        // =========================
        //  ERRORES DE CLOUDINARY
        // =========================
        const rawMessage = error?.message || "";

        if (
            rawMessage.includes("Invalid image file") ||
            rawMessage.includes("Unsupported image format") ||
            rawMessage.includes("format")
        ) {
            return res.status(400).json({
                message: "Formato de imagen no permitido. Solo JPG, JPEG, PNG o WEBP.",
            });
        }

        // =========================
        //  ERRORES DE PRISMA
        // =========================
        if (error?.code === "P2025") {
            return res.status(404).json({
                message: "Producto no encontrado. No se pudo asociar la imagen.",
            });
        }

        // =========================
        //  ERROR GENÉRICO
        // =========================
        return res.status(500).json({
            message: "Error interno al subir la imagen.",
        });
    }
}
