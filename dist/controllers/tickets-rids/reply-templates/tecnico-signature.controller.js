import { prisma } from "../../../lib/prisma.js";
import cloudinary from "../../../config/cloudinary.js";
import { Readable } from "stream";
export async function getTecnicoSignature(req, res) {
    try {
        const tecnicoId = Number(req.params.id);
        if (!tecnicoId) {
            return res.status(400).json({
                ok: false,
                message: "Técnico inválido",
            });
        }
        const tecnico = await prisma.tecnico.findUnique({
            where: { id_tecnico: tecnicoId },
            select: {
                id_tecnico: true,
                nombre: true,
                email: true,
                cargo: true,
                area: true,
                firmaTexto: true,
                firma: {
                    select: {
                        id: true,
                        path: true,
                        mimeType: true,
                        size: true,
                    },
                },
            },
        });
        if (!tecnico) {
            return res.status(404).json({
                ok: false,
                message: "Técnico no encontrado",
            });
        }
        return res.json({
            ok: true,
            data: tecnico,
        });
    }
    catch (error) {
        console.error("[tecnicos] getTecnicoSignature error:", error);
        return res.status(500).json({
            ok: false,
            message: "Error al obtener firma del técnico",
        });
    }
}
export async function updateTecnicoSignatureData(req, res) {
    try {
        const tecnicoId = Number(req.params.id);
        const { cargo, area, firmaTexto } = req.body;
        if (!tecnicoId) {
            return res.status(400).json({
                ok: false,
                message: "Técnico inválido",
            });
        }
        const tecnico = await prisma.tecnico.update({
            where: { id_tecnico: tecnicoId },
            data: {
                ...(cargo !== undefined && { cargo }),
                ...(area !== undefined && { area }),
                ...(firmaTexto !== undefined && { firmaTexto }),
            },
            select: {
                id_tecnico: true,
                nombre: true,
                email: true,
                cargo: true,
                area: true,
                firmaTexto: true,
                firma: {
                    select: {
                        id: true,
                        path: true,
                        mimeType: true,
                        size: true,
                    },
                },
            },
        });
        return res.json({
            ok: true,
            data: tecnico,
        });
    }
    catch (error) {
        console.error("[tecnicos] updateTecnicoSignatureData error:", error);
        return res.status(500).json({
            ok: false,
            message: "Error al guardar datos de firma",
        });
    }
}
export async function uploadTecnicoSignatureImage(req, res) {
    try {
        const tecnicoId = Number(req.params.id);
        const file = req.file;
        if (!tecnicoId) {
            return res.status(400).json({
                ok: false,
                message: "Técnico inválido",
            });
        }
        if (!file) {
            return res.status(400).json({
                ok: false,
                message: "Debes subir una imagen",
            });
        }
        const uploadResult = await new Promise((resolve, reject) => {
            const stream = cloudinary.uploader.upload_stream({
                folder: `rids/tecnicos/firmas/${tecnicoId}`,
                resource_type: "image",
                public_id: `firma_${tecnicoId}_${Date.now()}`,
            }, (error, result) => {
                if (error)
                    reject(error);
                else
                    resolve(result);
            });
            Readable.from(file.buffer).pipe(stream);
        });
        const firma = await prisma.firma.upsert({
            where: { tecnicoId },
            update: {
                path: uploadResult.secure_url,
                mimeType: file.mimetype,
                size: file.size,
            },
            create: {
                tecnicoId,
                path: uploadResult.secure_url,
                mimeType: file.mimetype,
                size: file.size,
            },
        });
        return res.json({
            ok: true,
            data: firma,
        });
    }
    catch (error) {
        console.error("[tecnicos] uploadTecnicoSignatureImage error:", error);
        return res.status(500).json({
            ok: false,
            message: "Error al subir firma del técnico",
        });
    }
}
export async function deleteTecnicoSignatureImage(req, res) {
    try {
        const tecnicoId = Number(req.params.id);
        if (!tecnicoId) {
            return res.status(400).json({
                ok: false,
                message: "Técnico inválido",
            });
        }
        await prisma.firma.deleteMany({
            where: { tecnicoId },
        });
        return res.json({
            ok: true,
            message: "Firma eliminada correctamente",
        });
    }
    catch (error) {
        console.error("[tecnicos] deleteTecnicoSignatureImage error:", error);
        return res.status(500).json({
            ok: false,
            message: "Error al eliminar firma",
        });
    }
}
//# sourceMappingURL=tecnico-signature.controller.js.map