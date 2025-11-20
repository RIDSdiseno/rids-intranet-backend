// controllers/whatchimp.controller.ts
import type { Request, Response } from "express";
import { wcSendText } from "../utils/wc.js";
import { runAI } from "../utils/ai.js";

type Incoming = {
  from?: string;
  type?: string;
  text?: string;
  image?: { id?: string; url?: string } | null;
  raw?: unknown;
};

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

// =====================
// Sesión y utilitarios
// =====================

type TranscriptItem = { from: "client" | "bot"; text: string };

type SessionMem = {
  lastUserMsg?: string;
  lastAIReply?: string;
  lastAt?: number;
  turns?: number;
  email?: string;
  company?: string;
  transcript?: TranscriptItem[];
};

const sessionMemory = new Map<string, SessionMem>();

const SEND_TO_WC = process.env.SEND_TO_WC === "1";
const MAX_TEXT_LEN = Number(process.env.MAX_TEXT_LEN || 1200);
const PER_USER_MIN_INTERVAL_MS = Number(
  process.env.PER_USER_MIN_INTERVAL_MS || 400
);

function rid() {
  return "req_" + Math.random().toString(36).slice(2) + Date.now().toString(36);
}

// Email: bastante robusto
const EMAIL_RE = /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i;

// Heurísticas básicas para extraer empresa
function extractCompanyFromText(text: string): string | undefined {
  const patterns = [
    /(?:mi\s+empresa\s+es|la\s+empresa\s+es|somos\s+de|soy\s+de|trabajo\s+en|de\s+la\s+empresa)\s+([a-z0-9áéíóúüñ .&_-]{2,80})/i,
  ];
  for (const re of patterns) {
    const m = text.match(re);
    if (m?.[1]) return m[1].trim().replace(/[.,;]$/, "");
  }

  const emailMatch = text.match(EMAIL_RE);
  if (emailMatch) {
    const after = text.slice(emailMatch.index! + emailMatch[0].length);
    const commaIdx = after.indexOf(",");
    if (commaIdx >= 0) {
      const tail = after.slice(commaIdx + 1).trim();
      if (tail && tail.length >= 2) {
        return tail.slice(0, 80).replace(/[.,;]$/, "");
      }
    }
  }

  return undefined;
}

export const wcReceive = async (req: Request, res: Response) => {
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
      return res
        .status(400)
        .json({ ok: false, error: "missing 'from'", requestId });
    }

    const now = Date.now();
    const mem = sessionMemory.get(inc.from) || {};

    // Anti-spam simple
    if (mem.lastAt && now - mem.lastAt < PER_USER_MIN_INTERVAL_MS) {
      const msg =
        "Estás enviando mensajes muy seguido. Intentémoslo de nuevo en unos segundos.";
      console.warn(`[RATE LIMIT][${requestId}] from=${inc.from}`);
      return res.status(200).type("text/plain; charset=utf-8").send(msg);
    }

    // Texto normalizado
    let inputText = inc.text ?? "";
    if (inputText.length > MAX_TEXT_LEN)
      inputText = inputText.slice(0, MAX_TEXT_LEN);

    // Contador de turnos
    const turns = (mem.turns ?? 0) + 1;

    // ======== extracción de email/empresa + transcript ========
    const emailFound = inputText.match(EMAIL_RE)?.[0] ?? undefined;
    let email = mem.email;
    if (!email && emailFound) {
      email = emailFound;
    }

    let company = mem.company;
    if (!company) {
      const c = extractCompanyFromText(inputText);
      if (c) company = c;
    }

    const prevTranscript: TranscriptItem[] = mem.transcript || [];
    const transcriptForAI: TranscriptItem[] = [...prevTranscript];
    if (inputText) {
      transcriptForAI.push({ from: "client", text: inputText });
    }
    // ==========================================================

    let reply: string;

    if (inc.type === "image") {
      reply =
        "📷 Recibí tu imagen. Cuéntame con texto qué necesitas y te ayudo al tiro.";
    } else if (!inputText) {
      reply =
        "¿Me cuentas en una frase qué necesitas? (equipo, síntoma y urgencia)";
    } else {
      const context = {
        from: inc.from,
        ...(mem.lastUserMsg ? { lastUserMsg: mem.lastUserMsg } : {}),
        ...(mem.lastAIReply ? { lastAIReply: mem.lastAIReply } : {}),
        turns,
        ...(email ? { email } : {}),
        ...(company ? { company } : {}),
        phone: inc.from, // usamos el mismo número como teléfono
        transcript: transcriptForAI,
      } as const;

      try {
        reply = (await runAI({ userText: inputText, context })) || "";
        if (!reply.trim()) {
          reply =
            "Tuve un problema procesando tu mensaje 😓. ¿Podemos intentarlo de nuevo?";
        }
      } catch (e) {
        console.error(`[AI ERROR][${requestId}]`, e);
        reply =
          "Tuve un problema procesando tu mensaje 😓. ¿Podemos intentarlo de nuevo?";
      }
    }

    // Actualizamos transcript agregando la respuesta del bot
    const newTranscript: TranscriptItem[] = [...(mem.transcript || [])];
    if (inputText) {
      newTranscript.push({ from: "client", text: inputText });
    }
    newTranscript.push({ from: "bot", text: reply });

    // Actualizamos memoria
    const next: SessionMem = {
      lastAIReply: reply,
      lastAt: now,
      turns,
      transcript: newTranscript,
      ...(email ? { email } : {}),
      ...(company ? { company } : {}),
    };
    if (inputText) {
      next.lastUserMsg = inputText;
    } else if (mem.lastUserMsg) {
      next.lastUserMsg = mem.lastUserMsg;
    }
    sessionMemory.set(inc.from, next);

    if (SEND_TO_WC) {
      try {
        await wcSendText(inc.from, reply);
      } catch (e) {
        console.error(`[WC SEND ERROR][${requestId}]`, e);
      }
    }

    const latencyMs = Date.now() - t0;
    console.log(`[WC OK][${requestId}] latency=${latencyMs}ms`);

    return res.status(200).type("text/plain; charset=utf-8").send(reply);
  } catch (e) {
    console.error(`[WC ERROR][${rid()}]`, e);
    return res.status(500).json({ ok: false, error: "internal_error" });
  }
};

export const wcHealth = (_req: Request, res: Response) => {
  res.status(200).json({ ok: true, service: "whatchimp-webhook-ia" });
};
