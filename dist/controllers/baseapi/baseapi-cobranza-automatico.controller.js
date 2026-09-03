import { procesarCobranzaAutomatica, } from "../../service/baseapi/cobranza/cobranza-automatico.service.js";
export async function simularCobranzaAutomatica(req, res) {
    try {
        const mesesRaw = Number(req.body?.mesesAnalizar ??
            req.query?.mesesAnalizar ??
            12);
        const mesesAnalizar = Number.isFinite(mesesRaw)
            ? Math.max(1, Math.min(Math.trunc(mesesRaw), 24))
            : 12;
        const empresaRaw = String(req.body?.empresa ??
            req.query?.empresa ??
            "")
            .trim()
            .toLowerCase();
        let empresas;
        if (empresaRaw === "econnet" ||
            empresaRaw === "rids") {
            empresas = [
                empresaRaw,
            ];
        }
        const resultado = await procesarCobranzaAutomatica({
            mesesAnalizar,
            ...(empresas
                ? {
                    empresas,
                }
                : {}),
        });
        return res.json({
            ok: true,
            ...resultado,
        });
    }
    catch (error) {
        const message = error instanceof Error
            ? error.message
            : String(error);
        console.error("[COBRANZA AUTO] Error simulando cobranza:", error);
        return res.status(500).json({
            ok: false,
            error: message,
            message,
        });
    }
}
//# sourceMappingURL=baseapi-cobranza-automatico.controller.js.map