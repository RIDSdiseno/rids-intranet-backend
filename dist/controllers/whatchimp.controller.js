import { wcSendText } from "../utils/wc.js";
import { runAI } from "../utils/ai.js";
import { saveMessage, getLongTermMemory } from "../service/memory.service.js";
function rid() {
    return "req_" + Math.random().toString(36).slice(2) + Date.now().toString(36);
}
function normalizeForAI(text) {
    return text
        .toLowerCase()
        .replace(/\s+/g, " ")
        .replace(/[“”]/g, '"')
        .replace(/[’‘]/g, "'")
        .trim();
}
function parseIncoming(body) {
    const from = body?.from || body?.message?.from || body?.contact?.wa_id || body?.contact?.waId || body?.contact;
    const type = body?.message?.type || body?.type || (body?.image ? "image" : "text");
    const rawText = body?.message?.text?.body ?? body?.text?.body ?? (typeof body?.text === "string" ? body.text : undefined);
    const text = typeof rawText === "string" ? rawText.trim() : undefined;
    const image = body?.message?.image || body?.image || null;
    return { from, type, ...(text !== undefined ? { text } : {}), ...(image !== undefined ? { image } : {}), raw: body };
}
const sessionMemory = new Map();
export const wcReceive = async (req, res) => {
    const requestId = rid();
    const t0 = Date.now();
    try {
        const inc = parseIncoming(req.body);
        if (!inc.from) {
            return res.status(400).json({ ok: false, error: "missing 'from'", requestId });
        }
        const now = Date.now();
        const mem = sessionMemory.get(inc.from) || {};
        let inputText = inc.text ? normalizeForAI(inc.text) : "";
        const turns = (mem.turns ?? 0) + 1;
        let email = mem.email || (inputText.match(/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i)?.[0]);
        let company = mem.company;
        let reply;
        if (inc.type === "image") {
            reply = "📷 Recibí tu imagen. Cuéntame con texto qué necesitas.";
        }
        else if (!inputText) {
            reply = "¿Me cuentas qué necesitas? (equipo, síntoma y urgencia)";
        }
        else {
            // 1. Persistencia inmediata del mensaje del cliente 
            if (inputText) {
                await saveMessage(inc.from, "client", inputText);
            }
            // 2. Recuperación de historial desde la DB 
            const dbHistory = await getLongTermMemory(inc.from, 15);
            // 3. Mapeo y refuerzo de memoria manual para evitar latencia de DB [cite: 1, 7, 10]
            const transcriptMapped = dbHistory.map((h) => ({
                from: (h.role === "assistant" || h.role === "bot" ? "bot" : "client"),
                text: h.content,
            }));
            const lastMsgText = transcriptMapped[transcriptMapped.length - 1]?.text;
            if (inputText && lastMsgText !== inputText) {
                transcriptMapped.push({ from: "client", text: inputText });
            }
            // Única declaración de context para evitar error ts(2451) 
            const context = {
                from: inc.from,
                phone: inc.from,
                turns,
                ...(email ? { email } : {}),
                ...(company ? { company } : {}),
                transcript: transcriptMapped,
            };
            try {
                // 4. Ejecución de la IA con contexto completo 
                reply = (await runAI({ userText: inputText, context })) || "";
                if (reply.trim()) {
                    await saveMessage(inc.from, "bot", reply);
                }
            }
            catch (e) {
                console.error(`[AI ERROR]`, e);
                reply = "Tuve un problema procesando tu mensaje 😓.";
            }
        }
        sessionMemory.set(inc.from, { ...mem, lastAt: now, turns, email, company });
        if (process.env.SEND_TO_WC === "1") {
            await wcSendText(inc.from, reply);
        }
        return res.status(200).type("text/plain; charset=utf-8").send(reply);
    }
    catch (e) {
        console.error(`[CRITICAL ERROR]`, e);
        return res.status(500).json({ ok: false, error: "internal_error" });
    }
};
export const wcHealth = (_req, res) => {
    res.status(200).json({ ok: true, service: "whatchimp-webhook-ia" });
};
//# sourceMappingURL=whatchimp.controller.js.map