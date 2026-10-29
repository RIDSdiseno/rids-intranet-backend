import { iniciarEnvioMasivo, obtenerFirmaMailer, obtenerMailerJob, } from "../service/correos-masivos/correos-masivos.service.js";
import { crearPlantillaCorreo, listarPlantillasCorreo, obtenerPlantillaCorreo, eliminarPlantillaCorreo, actualizarPlantillaCorreo, } from "../service/correos-masivos/correos-masivos-template.service.js";
// =====================================================
// ENVÍO MASIVO
// =====================================================
export async function enviarMasivo(req, res) {
    try {
        const { targets, subject, bodyHtml, plantillaId, attachments, } = req.body;
        if (!Array.isArray(targets) ||
            !String(subject ??
                "").trim() ||
            (!String(bodyHtml ??
                "").trim() &&
                !plantillaId)) {
            return res
                .status(400)
                .json({
                ok: false,
                message: "Se requieren targets, subject y bodyHtml o plantillaId",
            });
        }
        const parsedPlantillaId = plantillaId !== undefined &&
            plantillaId !== null &&
            plantillaId !== ""
            ? Number(plantillaId)
            : undefined;
        if (parsedPlantillaId !== undefined &&
            (!Number.isInteger(parsedPlantillaId) ||
                parsedPlantillaId <= 0)) {
            return res
                .status(400)
                .json({
                ok: false,
                message: "plantillaId inválido",
            });
        }
        const result = await iniciarEnvioMasivo({
            targets,
            subject: String(subject).trim(),
            attachments: Array.isArray(attachments)
                ? attachments
                : [],
            user: req.user,
            ...(typeof bodyHtml === "string"
                ? {
                    bodyHtml,
                }
                : {}),
            ...(parsedPlantillaId !== undefined
                ? {
                    plantillaId: parsedPlantillaId,
                }
                : {}),
        });
        return res.json({
            ok: true,
            ...result,
        });
    }
    catch (error) {
        console.error("[Mailer] Error enviando:", error);
        return res
            .status(500)
            .json({
            ok: false,
            message: error?.message ??
                "Error procesando envío masivo",
        });
    }
}
// =====================================================
// ESTADO JOB
// =====================================================
export async function obtenerEstadoEnvioMasivo(req, res) {
    try {
        const { id, } = req.params;
        if (!id) {
            return res
                .status(400)
                .json({
                ok: false,
                message: "Se requiere job id",
            });
        }
        const job = obtenerMailerJob(id);
        if (!job) {
            return res
                .status(404)
                .json({
                ok: false,
                message: "Job no encontrado",
            });
        }
        return res.json({
            ok: true,
            job,
        });
    }
    catch (error) {
        console.error("[Mailer] Error obteniendo estado:", error);
        return res
            .status(500)
            .json({
            ok: false,
            message: error?.message ??
                "Error obteniendo estado del envío",
        });
    }
}
// =====================================================
// CREAR PLANTILLA
// =====================================================
export async function crearPlantilla(req, res) {
    try {
        const file = req.file;
        if (!file) {
            return res
                .status(400)
                .json({
                ok: false,
                message: "Debes adjuntar un archivo de plantilla",
            });
        }
        const nombre = String(req.body?.nombre ??
            file.originalname).trim();
        if (!nombre) {
            return res
                .status(400)
                .json({
                ok: false,
                message: "El nombre de la plantilla es obligatorio",
            });
        }
        const descripcion = String(req.body?.descripcion ??
            "").trim() ||
            null;
        const rawUso = String(req.body?.uso ??
            "CONTENIDO")
            .trim()
            .toUpperCase();
        const user = req.user;
        let creadoPorId = null;
        if (user?.id !==
            undefined) {
            const parsed = Number(user.id);
            if (Number.isInteger(parsed) &&
                parsed > 0) {
                creadoPorId =
                    parsed;
            }
        }
        if (rawUso !== "CONTENIDO" &&
            rawUso !== "FIRMA") {
            return res
                .status(400)
                .json({
                ok: false,
                message: "Uso de plantilla inválido",
            });
        }
        const uso = rawUso;
        const plantilla = await crearPlantillaCorreo({
            nombre,
            descripcion,
            uso,
            nombreArchivo: file.originalname,
            mimeType: file.mimetype,
            buffer: file.buffer,
            creadoPorId,
        });
        return res
            .status(201)
            .json({
            ok: true,
            plantilla,
        });
    }
    catch (error) {
        console.error("[Mailer] Error creando plantilla:", error);
        return res
            .status(400)
            .json({
            ok: false,
            message: error?.message ??
                "No fue posible crear la plantilla",
        });
    }
}
// =====================================================
// LISTAR PLANTILLAS
// =====================================================
export async function listarPlantillas(req, res) {
    try {
        const rawUso = typeof req.query.uso ===
            "string"
            ? req.query.uso
                .trim()
                .toUpperCase()
            : undefined;
        let uso;
        if (rawUso ===
            "CONTENIDO") {
            uso =
                "CONTENIDO";
        }
        if (rawUso ===
            "FIRMA") {
            uso =
                "FIRMA";
        }
        if (rawUso &&
            !uso) {
            return res
                .status(400)
                .json({
                ok: false,
                message: "Uso de plantilla inválido",
            });
        }
        const plantillas = await listarPlantillasCorreo(uso);
        return res.json({
            ok: true,
            plantillas,
        });
    }
    catch (error) {
        console.error("[Mailer] Error listando plantillas:", error);
        return res
            .status(500)
            .json({
            ok: false,
            message: error?.message ??
                "Error obteniendo plantillas",
        });
    }
}
// =====================================================
// OBTENER PLANTILLA
// =====================================================
export async function obtenerPlantilla(req, res) {
    try {
        const id = Number(req.params.id);
        if (!Number.isInteger(id) ||
            id <= 0) {
            return res
                .status(400)
                .json({
                ok: false,
                message: "ID de plantilla inválido",
            });
        }
        const plantilla = await obtenerPlantillaCorreo(id);
        return res.json({
            ok: true,
            plantilla,
        });
    }
    catch (error) {
        console.error("[Mailer] Error obteniendo plantilla:", error);
        return res
            .status(404)
            .json({
            ok: false,
            message: error?.message ??
                "Plantilla no encontrada",
        });
    }
}
// =====================================================
// ELIMINAR PLANTILLA
// =====================================================
export async function eliminarPlantilla(req, res) {
    try {
        const id = Number(req.params.id);
        if (!Number.isInteger(id) ||
            id <= 0) {
            return res
                .status(400)
                .json({
                ok: false,
                message: "ID de plantilla inválido",
            });
        }
        await eliminarPlantillaCorreo(id);
        return res.json({
            ok: true,
            message: "Plantilla eliminada correctamente",
        });
    }
    catch (error) {
        console.error("[Mailer] Error eliminando plantilla:", error);
        return res
            .status(400)
            .json({
            ok: false,
            message: error?.message ??
                "No fue posible eliminar la plantilla",
        });
    }
}
export async function actualizarPlantilla(req, res) {
    try {
        const id = Number(req.params.id);
        if (!Number.isInteger(id) ||
            id <= 0) {
            return res
                .status(400)
                .json({
                ok: false,
                message: "ID de plantilla inválido",
            });
        }
        const { nombre, descripcion, uso, activo, } = req.body ?? {};
        if (uso !== undefined &&
            uso !== "CONTENIDO" &&
            uso !== "FIRMA") {
            return res
                .status(400)
                .json({
                ok: false,
                message: "Uso de plantilla inválido",
            });
        }
        if (nombre !== undefined &&
            !String(nombre).trim()) {
            return res
                .status(400)
                .json({
                ok: false,
                message: "El nombre no puede estar vacío",
            });
        }
        const plantilla = await actualizarPlantillaCorreo(id, {
            ...(nombre !== undefined
                ? {
                    nombre: String(nombre),
                }
                : {}),
            ...(descripcion !== undefined
                ? {
                    descripcion: descripcion === null
                        ? null
                        : String(descripcion).trim() ||
                            null,
                }
                : {}),
            ...(uso !== undefined
                ? {
                    uso: uso,
                }
                : {}),
            ...(typeof activo === "boolean"
                ? {
                    activo,
                }
                : {}),
        });
        return res.json({
            ok: true,
            plantilla,
        });
    }
    catch (error) {
        return res
            .status(400)
            .json({
            ok: false,
            message: error?.message ??
                "No fue posible actualizar la plantilla",
        });
    }
}
// =====================================================
// FIRMA MAILER
// =====================================================
export async function obtenerFirmaRemitente(_req, res) {
    try {
        const firma = await obtenerFirmaMailer();
        return res.json({
            ok: true,
            firma,
        });
    }
    catch (error) {
        console.error("[Mailer] Error obteniendo firma:", error);
        return res
            .status(400)
            .json({
            ok: false,
            message: error?.message ??
                "No fue posible obtener la firma",
        });
    }
}
//# sourceMappingURL=correos-masivos.controller.js.map