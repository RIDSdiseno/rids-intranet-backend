export async function uploadImagen(req, res) {
    try {
        const file = req.file;
        if (!file) {
            return res.status(400).json({ error: "No se envió imagen" });
        }
        console.log("✅ Imagen subida a Cloudinary:", file.path);
        // Cloudinary devuelve un objeto con varias propiedades
        // file.path es la URL segura (secure_url)
        return res.json({
            url: file.path, // URL pública
            secure_url: file.path, // URL segura (HTTPS)
            public_id: file.filename, // ID en Cloudinary
            format: file.mimetype,
            bytes: file.size
        });
    }
    catch (error) {
        console.error("❌ Error al subir imagen:", error);
        return res.status(500).json({ error: "Error al subir imagen" });
    }
}
//# sourceMappingURL=upload-imagenes.controller.js.map