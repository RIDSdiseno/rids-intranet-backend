import { z } from "zod";
import { DetalleLicitacionNoDisponibleError, LicitacionNoEncontradaError, listarHitosLicitacion, sincronizarHitosLicitacion, sincronizarHitosLicitacionesVigentes, } from "../../service/mercado-publico/mercado-publico-hitos.service.js";
import { procesarAvisosLicitaciones, } from "../../service/mercado-publico/mercado-publico-avisos.service.js";
const idSchema = z.object({
    id: z.coerce.number().int().positive(),
});
function manejarErrorHitos(error, res, contexto) {
    if (error instanceof LicitacionNoEncontradaError) {
        return res.status(404).json({ success: false, code: "LICITACION_NO_ENCONTRADA", message: error.message });
    }
    if (error instanceof DetalleLicitacionNoDisponibleError) {
        return res.status(502).json({ success: false, code: "DETALLE_NO_DISPONIBLE", message: error.message });
    }
    console.error(`[MERCADO PUBLICO][hitos] ${contexto}:`, error);
    return res.status(500).json({
        success: false,
        code: "ERROR_INTERNO",
        message: "No fue posible procesar los hitos de la licitación.",
    });
}
/** GET /mercado-publico/:id/hitos */
export async function listarHitosController(req, res) {
    const params = idSchema.safeParse(req.params);
    if (!params.success)
        return res.status(400).json({ success: false, code: "ID_INVALIDO" });
    try {
        const data = await listarHitosLicitacion(params.data.id);
        return res.json({ success: true, data });
    }
    catch (error) {
        return manejarErrorHitos(error, res, "Listar");
    }
}
/** POST /mercado-publico/:id/hitos/sincronizar */
export async function sincronizarHitosController(req, res) {
    const params = idSchema.safeParse(req.params);
    if (!params.success)
        return res.status(400).json({ success: false, code: "ID_INVALIDO" });
    try {
        const resultado = await sincronizarHitosLicitacion(params.data.id);
        const hitos = await listarHitosLicitacion(params.data.id);
        return res.json({ success: true, data: { resultado, hitos } });
    }
    catch (error) {
        return manejarErrorHitos(error, res, "Sincronizar");
    }
}
/* ==================== AVISOS ==================== */
/**
 * POST /mercado-publico/avisos/procesar
 * Por defecto SIMULA (no envía ni registra): devuelve qué se enviaría.
 * Con ?enviar=1 envía y registra (mismo proceso del cron, sin sincronizar).
 */
export async function procesarAvisosController(req, res) {
    const enviar = String(req.query.enviar ?? "") === "1";
    try {
        const data = await procesarAvisosLicitaciones({ simular: !enviar });
        return res.json({ success: true, data });
    }
    catch (error) {
        return manejarErrorHitos(error, res, "Avisos");
    }
}
/** POST /mercado-publico/hitos/sincronizar-vigentes (lo usará también el cron) */
export async function sincronizarHitosVigentesController(_req, res) {
    try {
        const data = await sincronizarHitosLicitacionesVigentes();
        return res.json({ success: true, data });
    }
    catch (error) {
        return manejarErrorHitos(error, res, "Sincronizar vigentes");
    }
}
//# sourceMappingURL=mercado-publico-hitos.controller.js.map