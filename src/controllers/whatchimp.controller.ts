import type { Request, Response } from "express";
import { wcSendText } from "../utils/wc.js";
import { runAI } from "../utils/ai.js";
import { saveMessage, getLongTermMemory } from "../service/memory.service.js";

// Definición del tipo para que no sea "unused"
type Incoming = {
  from?: string;
  type?: string;
  text?: string;
  image?: { id?: string; url?: string } | null;
  raw?: unknown;
};

// =====================
// Funciones Auxiliares (Las que te faltaban)
// =====================

function rid() {
  return "req_" + Math.random().toString(36).slice(2) + Date.now().toString(36);
}

function normalizeForAI(text: string) {
  return text
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/[“”]/g, '"')
    .replace(/[’‘]/g, "'")
    .trim();
}

function parseIncoming(body: any): Incoming {
  const from =
    body?.from ||
    body?.message?.from ||
    body?.contact?.wa_id ||
    body?.contact?.waId ||
    body?.contact;

  const type =
    body?.message?.type || body?.type || (body?.image ? "image" : "text");

  const rawText: unknown =
    body?.message?.text?.body ??
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

const sessionMemory = new Map<string, any>();

// =====================
// Controlador Principal
// =====================

export const wcReceive = async (req: Request, res: Response) => {
  const requestId = rid();
  const t0 = Date.now();

  try {
    const inc: Incoming = parseIncoming(req.body); 
    
    if (!inc.from) {
      return res.status(400).json({ ok: false, error: "missing 'from'", requestId });
    }

    const now = Date.now();
    const mem = sessionMemory.get(inc.from) || {};

    let inputText = inc.text ? normalizeForAI(inc.text) : "";
    const turns = (mem.turns ?? 0) + 1;

    let email = mem.email || (inputText.match(/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i)?.[0]);
    let company = mem.company;

    let reply: string;

    if (inc.type === "image") {
      reply = "📷 Recibí tu imagen. Cuéntame con texto qué necesitas.";
    } else if (!inputText) {
      reply = "¿Me cuentas qué necesitas? (equipo, síntoma y urgencia)";
    } else {
      // ==========================================================
      // 1. PERSISTENCIA INMEDIATA: Guardamos lo que dijo el cliente
      // ==========================================================
      if (inputText) {
        await saveMessage(inc.from, "client", inputText);
      }

      // ==========================================================
      // 2. RECUPERACIÓN: Ahora el historial SI incluye el mensaje actual
      // ==========================================================
      const dbHistory = await getLongTermMemory(inc.from, 15);

      const context = {
        from: inc.from as string,
        phone: inc.from,
        turns,
        ...(email ? { email } : {}),
        ...(company ? { company } : {}),
        transcript: dbHistory.map((h) => ({
          from: (h.role === "assistant" || h.role === "bot" ? "bot" : "client") as "bot" | "client",
          text: h.content,
        })),
      };

      try {
        // 3. LA IA AHORA RECIBE EL CONTEXTO COMPLETO
        reply = (await runAI({ userText: inputText, context })) || "";
        
        // 4. GUARDAR RESPUESTA DEL BOT
        if (reply.trim()) {
          await saveMessage(inc.from, "bot", reply);
        }

      } catch (e) {
        console.error(`[AI ERROR]`, e);
        reply = "Tuve un problema procesando tu mensaje 😓.";
      }
    }

    sessionMemory.set(inc.from, { ...mem, lastAt: now, turns, email, company });

    if (process.env.SEND_TO_WC === "1") {
      await wcSendText(inc.from, reply);
    }

    return res.status(200).type("text/plain; charset=utf-8").send(reply);
  } catch (e) {
    console.error(`[CRITICAL ERROR]`, e);
    return res.status(500).json({ ok: false, error: "internal_error" });
  }
};

export const wcHealth = (_req: Request, res: Response) => {
  res.status(200).json({ ok: true, service: "whatchimp-webhook-ia" });
};