// src/controllers/controllers-empresas/servidor-usuarios.controller.ts
import { prisma } from "../../lib/prisma.js";
/* =======================================================
   GET - Usuarios por servidor
   GET /api/ficha-empresa/servidores/:servidorId/usuarios
======================================================= */
export const getUsuariosByServidor = async (req, res) => {
    try {
        const { servidorId } = req.params;
        const usuarios = await prisma.servidorUsuario.findMany({
            where: { servidorId: Number(servidorId) },
            orderBy: { id: "asc" },
        });
        res.json({ success: true, data: usuarios });
    }
    catch (error) {
        console.error("Error obteniendo usuarios del servidor:", error);
        res.status(500).json({ success: false, message: "Error interno" });
    }
};
/* =======================================================
   POST - Crear usuario servidor
   POST /api/ficha-empresa/servidores/:servidorId/usuarios
======================================================= */
export const createUsuarioServidor = async (req, res) => {
    try {
        const { servidorId } = req.params;
        const nuevoUsuario = await prisma.servidorUsuario.create({
            data: {
                ...req.body,
                servidorId: Number(servidorId),
            },
        });
        res.json({ success: true, data: nuevoUsuario });
    }
    catch (error) {
        console.error("Error creando usuario servidor:", error);
        res.status(500).json({ success: false, message: "Error interno" });
    }
};
/* =======================================================
   PUT - Actualizar usuario servidor
   PUT /api/ficha-empresa/servidor-usuarios/:id
======================================================= */
export const updateUsuarioServidor = async (req, res) => {
    try {
        const { id } = req.params;
        const actualizado = await prisma.servidorUsuario.update({
            where: { id: Number(id) },
            data: req.body,
        });
        res.json({ success: true, data: actualizado });
    }
    catch (error) {
        console.error("Error actualizando usuario servidor:", error);
        res.status(500).json({ success: false, message: "Error interno" });
    }
};
/* =======================================================
   DELETE - Eliminar usuario servidor
   DELETE /api/ficha-empresa/servidor-usuarios/:id
======================================================= */
export const deleteUsuarioServidor = async (req, res) => {
    try {
        const { id } = req.params;
        await prisma.servidorUsuario.delete({
            where: { id: Number(id) },
        });
        res.json({ success: true });
    }
    catch (error) {
        console.error("Error eliminando usuario servidor:", error);
        res.status(500).json({ success: false, message: "Error interno" });
    }
};
//# sourceMappingURL=servidor-usuarios.controller.js.map