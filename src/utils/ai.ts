// utils/ai.ts

// Si usas Node < 18, descomenta estas 2 líneas:
// import fetch from "node-fetch";
// (globalThis as any).fetch = fetch;

export type RunAIInput = {
  userText: string;
  context?: {
    from: string;
    lastUserMsg?: string;
    lastAIReply?: string;
    turns?: number;
    email?: string;
    company?: string;
  };
};

type ChatRole = "system" | "user" | "assistant";

type ChatMessage = {
  role: ChatRole;
  content: string;
};

type OpenAIChatChoice = {
  index: number;
  message: { role: "assistant"; content: string };
  finish_reason?: string;
};

type OpenAIChatResponse = {
  id: string;
  object: string; // "chat.completion"
  created: number;
  model: string;
  choices: OpenAIChatChoice[];
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
};

const PROVIDER = process.env.AI_PROVIDER || "openai";
const OPENAI_API_KEY = process.env.OPENAI_API_KEY || "";
const OPENAI_MODEL = process.env.OPENAI_MODEL || "gpt-4.1-mini";
const AI_TEMPERATURE = Number(process.env.AI_TEMPERATURE ?? 0.2);

// -----------------------------------------------------------------------------
// PROMPT DE CONTROL
// -----------------------------------------------------------------------------
const BASE_SYSTEM_PROMPT = `
Eres un asistente por WhatsApp para una empresa de TI en Chile.

Política estricta vigente HASTA el 15 de enero de 2026:
— SOLO puedes ayudar en (1) SOPORTE TÉCNICO y (2) VENTAS.
— Si el usuario pide algo fuera de ventas/soporte, responde breve:
  "Por política vigente hasta el 15 de enero de 2026 solo puedo ayudar en ventas y soporte técnico. Si necesitas otra gestión, puedo derivarte a un ejecutivo."
— No inventes datos, precios ni plazos; si corresponde, ofrece cotización o derivación.

Ticket y datos obligatorios:
— SOLO si falta alguno de estos datos, pídelo al inicio: correo del usuario y nombre de su empresa.
— Si YA están en el contexto de sesión, NO los vuelvas a pedir. Si falta solo uno, pide únicamente el que falta.
— Ejemplo de solicitud única cuando falte: 
  "Para generar tu ticket, ¿me compartes tu [dato faltante]?"

Estilo y formato:
— Español claro (chileno neutro), profesional y amable.
— Respuestas concisas (2–5 frases). Si procede, usa pasos numerados.
— Máximo UNA pregunta de clarificación.
— No repitas lo ya dicho ni pidas datos que ya entregó el usuario.
— Quédate SIEMPRE en ventas o soporte.
`;

// -----------------------------------------------------------------------------
// Llamado a OpenAI
// -----------------------------------------------------------------------------
async function callOpenAI(messages: ChatMessage[]): Promise<string | null> {
  if (!OPENAI_API_KEY) {
    return "Hola 👋 Para generar tu ticket, ¿me compartes tu correo y el nombre de tu empresa?";
  }

  const resp = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${OPENAI_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: OPENAI_MODEL,
      temperature: AI_TEMPERATURE,
      max_tokens: 320,
      frequency_penalty: 0.2,
      presence_penalty: 0.0,
      messages,
    }),
  });

  if (!resp.ok) {
    const t = await resp.text().catch(() => "");
    console.error("OpenAI error:", resp.status, t);
    return null;
  }

  const data = (await resp.json()) as unknown;

  if (
    typeof data === "object" &&
    data !== null &&
    Array.isArray((data as OpenAIChatResponse).choices) &&
    (data as OpenAIChatResponse).choices.length > 0
  ) {
    const first = (data as OpenAIChatResponse).choices[0];
    const content = first?.message?.content;
    return typeof content === "string" ? content.trim() : null;
  }

  console.error("OpenAI parse error: respuesta sin choices válidos");
  return null;
}

// -----------------------------------------------------------------------------
// Orquestación
// -----------------------------------------------------------------------------
export async function runAI(input: RunAIInput): Promise<string> {
  if (PROVIDER !== "openai") {
    throw new Error(`Proveedor IA no soportado: ${PROVIDER}`);
  }

  const user = input.userText?.trim() || "";
  const turns = input.context?.turns ?? 1;
  const email = input.context?.email;
  const company = input.context?.company;

  const prev = input.context?.lastUserMsg ? `\n[prev_user]: ${input.context.lastUserMsg}` : "";
  const prevBot = input.context?.lastAIReply ? `\n[prev_bot]: ${input.context.lastAIReply}` : "";

  const escalateLine =
    turns >= 10
      ? "\nSi la conversación suma 10 turnos o más, agrega al final: '¿Quieres que derive tu caso a un ejecutivo humano?'"
      : "";

  // Le declaramos explícitamente a la IA lo que ya tenemos
  const sessionFacts = `
Contexto de sesión:
— Turnos: ${turns}
— Correo del usuario: ${email ? email : "(aún NO disponible)"}
— Empresa del usuario: ${company ? company : "(aún NO disponible)"}
${escalateLine}
`;

  const SYSTEM_PROMPT = `${BASE_SYSTEM_PROMPT}
${sessionFacts}
Recuerda: si correo y empresa ya están disponibles en este contexto, NO los vuelvas a pedir.
Si falta solo uno, pide SOLO ese dato y continúa con la ayuda (ventas o soporte).
`;

  const messages: ChatMessage[] = [
    { role: "system", content: SYSTEM_PROMPT },
    { role: "user", content: `${user}${prev}${prevBot}` },
  ];

  const out = await callOpenAI(messages);
  if (out && out.length > 0) return out;

  return "Tuve un problema procesando tu mensaje 😓. ¿Lo intentamos de nuevo? (Ventas o soporte) Para generar tu ticket, ¿me compartes tu correo y el nombre de tu empresa?";
}
