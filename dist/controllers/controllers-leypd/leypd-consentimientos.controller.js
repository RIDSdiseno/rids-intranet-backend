// src/controllers/controllers-leypd/leypd-consentimientos.controller.ts
import { obtenerResumenConsentimientosLeypd, } from "../../service/leypd/leypd-consentimientos.service.js";
import { empresaIdSchema, } from "../../service/leypd/leypd.schemas.js";
export async function getConsentimientosElementoLeypd(req, res) {
    const parsed = empresaIdSchema.safeParse(req.params.empresaId);
    if (!parsed.success) {
        return res
            .status(400)
            .json({
            message: "ID de empresa inválido.",
        });
    }
    try {
        return res.json(await obtenerResumenConsentimientosLeypd(parsed.data));
    }
    catch (error) {
        if (error instanceof Error &&
            error.message ===
                "EMPRESA_NO_ENCONTRADA") {
            return res
                .status(404)
                .json({
                message: "Empresa no encontrada.",
            });
        }
        console.error("[LEYPD CONSENTIMIENTOS]", error);
        return res
            .status(500)
            .json({
            message: "No se pudo obtener el resumen de consentimientos.",
        });
    }
}
//# sourceMappingURL=leypd-consentimientos.controller.js.map