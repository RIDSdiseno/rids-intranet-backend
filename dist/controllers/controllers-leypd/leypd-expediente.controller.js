// src/controllers/controllers-leypd/leypd-expediente.controller.ts
import { empresaIdSchema, } from "../../service/leypd/leypd.schemas.js";
import { generarExpedienteLeypdPdf, } from "../../service/leypd/leypd-expediente-pdf.service.js";
const ERRORES_EXPEDIENTE = {
    EMPRESA_NO_ENCONTRADA: {
        status: 404,
        message: "Empresa no encontrada.",
    },
    SHAREPOINT_NO_VINCULADO: {
        status: 409,
        message: "La empresa no tiene la carpeta LEYPD de SharePoint vinculada.",
    },
    SIN_DOCUMENTOS_GENERADOS: {
        status: 409,
        message: "El worker aún no genera documentos para esta empresa. Ejecuta «Actualizar documentos» primero.",
    },
    EXPEDIENTE_EN_CURSO: {
        status: 409,
        message: "Ya se está generando el expediente de esta empresa. Espera a que termine.",
    },
};
/** GET /leypd/:empresaId/expediente/pdf */
export async function getExpedienteLeypdPdf(req, res) {
    const parsed = empresaIdSchema.safeParse(req.params.empresaId);
    if (!parsed.success) {
        return res
            .status(400)
            .json({
            message: "ID de empresa inválido.",
        });
    }
    try {
        const pdf = await generarExpedienteLeypdPdf(parsed.data, req.user?.email ??
            null);
        res.setHeader("Content-Type", "application/pdf");
        res.setHeader("Content-Disposition", `attachment; filename="${pdf.nombreArchivo}"`);
        res.setHeader("Cache-Control", "no-store");
        return res.send(pdf.buffer);
    }
    catch (error) {
        const conocido = error instanceof Error
            ? ERRORES_EXPEDIENTE[error.message]
            : undefined;
        if (conocido) {
            return res
                .status(conocido.status)
                .json({
                code: error.message,
                message: conocido.message,
            });
        }
        console.error("[LEYPD EXPEDIENTE]", error);
        return res
            .status(500)
            .json({
            message: "No se pudo generar el expediente.",
        });
    }
}
//# sourceMappingURL=leypd-expediente.controller.js.map