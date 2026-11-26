import { obtenerHostnameSugerido } from "../service/equipos/hostname-sugerido.service.js";
/* GET /api/equipos/:id/hostname-sugerido (solo internos; solo lectura) */
export async function getHostnameSugerido(req, res) {
    const id = Number(req.params.id);
    const resultado = await obtenerHostnameSugerido(id);
    if (!resultado) {
        res.status(404).json({ ok: false, error: "Equipo no encontrado" });
        return;
    }
    res.json(resultado);
}
//# sourceMappingURL=equipo-hostname.controller.js.map