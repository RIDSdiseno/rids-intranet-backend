import { prisma } from "../lib/prisma.js";
export async function uploadImagen(req, res) {
    try {
        const file = req.file;
        const { productoId } = req.body;
        if (!file) {
            return res.status(400).json({ error: "No se envió imagen" });
        }
        console.log("✅ Imagen subida a Cloudinary:", file.path);
        // ----------------------------
        // CASO 1 → Crear producto (sin productoId)
        // ----------------------------
        if (!productoId) {
            return res.json({
                message: "Imagen subida correctamente",
                imagen: file.path, // URL segura
                publicId: file.filename, // ID en Cloudinary
            });
        }
        // ----------------------------
        // CASO 2 → Editar producto (con productoId)
        // ----------------------------
        const producto = await prisma.productoGestioo.update({
            where: { id: Number(productoId) },
            data: {
                imagen: file.path,
                publicId: file.filename,
            },
        });
        return res.json({
            message: "Imagen actualizada correctamente",
            producto,
        });
    }
    catch (error) {
        console.error("❌ Error al subir imagen:", error);
        return res.status(500).json({ error: "Error al subir imagen" });
    }
}
//# sourceMappingURL=upload-imagenes.controller.js.map