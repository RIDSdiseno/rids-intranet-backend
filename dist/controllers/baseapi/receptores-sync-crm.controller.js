import { sincronizarReceptoresDesdeCrm, } from "../../service/baseapi/receptores-sync-crm.service.js";
/**
 * POST /…/receptores/sincronizar-crm            → simulación (no escribe)
 * POST /…/receptores/sincronizar-crm?aplicar=1  → aplica
 */
function crearHandler(modulo) {
    return async (req, res) => {
        const aplicar = req.query.aplicar ===
            "1";
        try {
            const resultado = await sincronizarReceptoresDesdeCrm(modulo, aplicar);
            return res.json({
                ok: true,
                data: resultado,
            });
        }
        catch (error) {
            console.error(`[RECEPTORES ${modulo}] Error sincronizando desde el CRM`, error);
            return res
                .status(500)
                .json({
                ok: false,
                error: error instanceof Error
                    ? error.message
                    : String(error),
            });
        }
    };
}
export const postSincronizarReceptoresFacturacionCrm = crearHandler("FACTURACION");
export const postSincronizarReceptoresCobranzaCrm = crearHandler("COBRANZA");
//# sourceMappingURL=receptores-sync-crm.controller.js.map