import { wcSendText } from "../utils/wc.js";
// Normaliza lo que envía Whatchimp a un shape simple
function parseIncoming(body) {
    const from = body?.from || body?.message?.from || body?.contact?.wa_id;
    const type = body?.message?.type || body?.type;
    const text = body?.message?.text?.body || body?.text?.body || body?.text;
    const image = body?.message?.image || null;
    return { from, type, text, image };
}
export const wcReceive = async (req, res) => {
    try {
        const inc = parseIncoming(req.body);
        console.log("[WC INBOUND]", inc);
        // Smoke reply (para validar ida-y-vuelta)
        if (inc.from) {
            await wcSendText(inc.from, "Recibido 👌 (backend OK). Enseguida seguimos con el flujo inteligente.");
        }
    }
    catch (e) {
        console.error("[WC ERROR]", e);
    }
    res.sendStatus(200);
};
//# sourceMappingURL=whatchimp.controller.js.map