import { wcSendText } from "../utils/wc.js";
import { runAI } from "../utils/ai.js";
function parseIncoming(body) {
    const from = body?.from ||
        body?.message?.from ||
        body?.contact?.wa_id ||
        body?.contact?.waId ||
        body?.contact;
    const type = body?.message?.type || body?.type || (body?.image ? "image" : "text");
    const rawText = body?.message?.text?.body ??
        body?.text?.body ??
        (typeof body?.text === "string" ? body.text : undefined);
    const text = typeof rawText === "string" ? rawText.trim() : undefined;
    const image = body?.message?.image || body?.image || null;
    return {
        from,
        type,
        ...(text !== undefined ? { text } : {}),
        ...(image !== undefined ? { image } : {}),
        raw: body,
    };
}
const sessionMemory = new Map();
const SEND_TO_WC = process.env.SEND_TO_WC === "1";
const MAX_TEXT_LEN = Number(process.env.MAX_TEXT_LEN || 1200);
const PER_USER_MIN_INTERVAL_MS = Number(process.env.PER_USER_MIN_INTERVAL_MS || 400);
function rid() {
    return "req_" + Math.random().toString(36).slice(2) + Date.now().toString(36);
}
// Email: bastante robusto
const EMAIL_RE = /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i;
// Heurísticas básicas para extraer empresa
function extractCompanyFromText(text) {
    // 1) Patrones "mi empresa es XXX", "soy de XXX", "somos de XXX", "trabajo en XXX"
    const patterns = [
        /(?:mi\s+empresa\s+es|la\s+empresa\s+es|somos\s+de|soy\s+de|trabajo\s+en|de\s+la\s+empresa)\s+([a-z0-9áéíóúüñ .&_-]{2,80})/i,
    ];
    for (const re of patterns) {
        const m = text.match(re);
        if (m?.[1])
            return m[1].trim().replace(/[.,;]$/, "");
    }
    // 2) Si hay email y luego una coma, tomar lo que viene después como posible empresa
    const emailMatch = text.match(EMAIL_RE);
    if (emailMatch) {
        const after = text.slice(emailMatch.index + emailMatch[0].length);
        const commaIdx = after.indexOf(",");
        if (commaIdx >= 0) {
            const tail = after.slice(commaIdx + 1).trim();
            if (tail && tail.length >= 2) {
                // tope 80 chars
                return tail.slice(0, 80).replace(/[.,;]$/, "");
            }
        }
    }
    // 3) Si el mensaje es corto y sin email, a veces dan solo la empresa (no lo aplicamos agresivo)
    return undefined;
}
export const wcReceive = async (req, res) => {
    const requestId = rid();
    const t0 = Date.now();
    try {
        const inc = parseIncoming(req.body);
        console.log(`[WC INBOUND][${requestId}]`, {
            from: inc.from,
            type: inc.type,
            textPreview: inc.text?.slice(0, 120),
        });
        if (!inc.from) {
            return res.status(400).json({ ok: false, error: "missing 'from'", requestId });
        }
        const now = Date.now();
        const mem = sessionMemory.get(inc.from) || {};
        // Anti-spam simple
        if (mem.lastAt && now - mem.lastAt < PER_USER_MIN_INTERVAL_MS) {
            const msg = "Estás enviando mensajes muy seguido. Intentémoslo de nuevo en unos segundos.";
            console.warn(`[RATE LIMIT][${requestId}] from=${inc.from}`);
            return res.status(200).type("text/plain; charset=utf-8").send(msg);
        }
        // Texto normalizado
        let inputText = inc.text ?? "";
        if (inputText.length > MAX_TEXT_LEN)
            inputText = inputText.slice(0, MAX_TEXT_LEN);
        // Contador de turnos
        const turns = (mem.turns ?? 0) + 1;
        // ======== NUEVO: extracción de email/empresa y persistencia ========
        // Si el mensaje trae un email y no lo teníamos, guardarlo
        const emailFound = inputText.match(EMAIL_RE)?.[0] ?? undefined;
        let email = mem.email;
        if (!email && emailFound) {
            email = emailFound;
        }
        // Empresa: heurística suave si aún no hay
        let company = mem.company;
        if (!company) {
            const c = extractCompanyFromText(inputText);
            if (c)
                company = c;
        }
        // ===================================================================
        let reply;
        if (inc.type === "image") {
            reply = "📷 Recibí tu imagen. Cuéntame con texto qué necesitas y te ayudo al tiro.";
        }
        else if (!inputText) {
            reply = "¿Me cuentas en una frase qué necesitas? (equipo, síntoma y urgencia)";
        }
        else {
            const context = {
                from: inc.from,
                ...(mem.lastUserMsg ? { lastUserMsg: mem.lastUserMsg } : {}),
                ...(mem.lastAIReply ? { lastAIReply: mem.lastAIReply } : {}),
                turns,
                // 👇 Pasamos a la IA lo que tengamos guardado
                ...(email ? { email } : {}),
                ...(company ? { company } : {}),
            };
            try {
                reply = (await runAI({ userText: inputText, context })) || "";
                if (!reply.trim()) {
                    reply = "Tuve un problema procesando tu mensaje 😓. ¿Podemos intentarlo de nuevo?";
                }
            }
            catch (e) {
                console.error(`[AI ERROR][${requestId}]`, e);
                reply = "Tuve un problema procesando tu mensaje 😓. ¿Podemos intentarlo de nuevo?";
            }
        }
        // Actualizamos memoria sin escribir `undefined`
        const next = {
            lastAIReply: reply,
            lastAt: now,
            turns,
            ...(email ? { email } : {}),
            ...(company ? { company } : {}),
        };
        if (inputText) {
            next.lastUserMsg = inputText;
        }
        else if (mem.lastUserMsg) {
            next.lastUserMsg = mem.lastUserMsg;
        }
        sessionMemory.set(inc.from, next);
        if (SEND_TO_WC) {
            try {
                await wcSendText(inc.from, reply);
            }
            catch (e) {
                console.error(`[WC SEND ERROR][${requestId}]`, e);
            }
        }
        const latencyMs = Date.now() - t0;
        console.log(`[WC OK][${requestId}] latency=${latencyMs}ms`);
        return res.status(200).type("text/plain; charset=utf-8").send(reply);
    }
    catch (e) {
        console.error(`[WC ERROR][${rid()}]`, e);
        return res.status(500).json({ ok: false, error: "internal_error" });
    }
};
export const wcHealth = (_req, res) => {
    res.status(200).json({ ok: true, service: "whatchimp-webhook-ia" });
};
//# sourceMappingURL=whatchimp.controller.js.map