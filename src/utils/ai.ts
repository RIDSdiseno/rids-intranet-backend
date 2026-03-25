// --- 1. Tipos ---
export type RunAIInput = {
  userText: string;
  context: {
    from: string;
    intent?: string;
    turns?: number;
    email?: string;
    company?: string;
    name?: string;
    phone?: string;
    transcript: Array<{ from: "client" | "bot"; text: string }>;
  };
};

type ChatMessage = { role: "system" | "user" | "assistant"; content: string };

interface OpenAIResponse {
  choices: Array<{
    message: {
      content: string | null;
      tool_calls?: any[];
    };
  }>;
}

import { createTicketFromWhatsapp } from "../service/whatchimp-ticket.service.js";
import { sendTicketCreatedEmail } from "../service/email.service.js";

const OPENAI_API_KEY = process.env.OPENAI_API_KEY || "";
const OPENAI_MODEL   = process.env.OPENAI_MODEL || "gpt-4-turbo";
const AI_TEMPERATURE = Number(process.env.AI_TEMPERATURE ?? 0.2);
const FD_API_KEY     = process.env.FD_API_KEY || "";
const FD_DOMAIN      = "rids.freshdesk.com";

// --- 2. Tool ---
const tools = [
  {
    type: "function",
    function: {
      name: "create_ticket",
      description: "Crea un ticket de soporte. Llama esta función SOLO cuando tengas los 5 datos obligatorios: name, email, phone, company y description.",
      parameters: {
        type: "object",
        properties: {
          name:        { type: "string", description: "Nombre completo del contacto" },
          email:       { type: "string", description: "Correo electrónico del contacto" },
          phone:       { type: "string", description: "Teléfono del contacto" },
          company:     { type: "string", description: "Nombre de la empresa" },
          description: { type: "string", description: "Descripción detallada del problema técnico" },
        },
        required: ["name", "email", "phone", "company", "description"]
      }
    }
  }
];

// --- 3. Lógica Principal ---
export const runAI = async ({ userText, context }: RunAIInput): Promise<string> => {
  console.log("-----------------------------------------");
  console.log("MENSAJE RECIBIDO:", userText);
  console.log("CONTEXTO:", { email: context.email, company: context.company, name: context.name, phone: context.phone });
  console.log("-----------------------------------------");

  const systemPrompt = `
Eres RIDSI, el asistente técnico experto de RIDS. Tu ÚNICA misión es ayudar con problemas informáticos y gestionar tickets de soporte.

REGLAS:
1. PROHIBIDO: Temas no informáticos (cocina, ocio, cultura general, deportes, etc.).
2. RESPUESTA ANTE LO PROHIBIDO: "Lo siento, como asistente técnico de RIDS solo puedo ayudarte con temas relacionados a informática, soporte y nuestros servicios. ¿En qué problema técnico te puedo apoyar hoy?".
3. FLUJO DE TICKETS: Para generar un ticket, DEBES recopilar obligatoriamente estos 5 datos en orden:
   - Nombre completo del contacto.
   - Correo electrónico del contacto.
   - Teléfono del contacto.
   - Nombre de la Empresa.
   - Descripción detallada del problema o requerimiento técnico.
4. Si el usuario entrega varios datos a la vez, captúralos todos. Pide solo los que faltan.
5. CREACIÓN DEL TICKET: Una vez que tengas los 5 datos, llama INMEDIATAMENTE la función create_ticket. NO confirmes el ticket con texto antes de llamar la función.
6. DESPUÉS de que la función se ejecute, informa al usuario que el ticket fue creado con su número y que recibirá un correo de confirmación con los detalles en 2 a 4 horas hábiles.

Mantén un tono profesional, directo y enfocado en la solución técnica.
  `.trim();

  const messages: ChatMessage[] = [
    { role: "system", content: systemPrompt },
    ...(context.transcript || []).map(t => ({
      role: (t.from === "bot" ? "assistant" : "user") as "assistant" | "user",
      content: t.text
    })),
    { role: "user", content: userText }
  ];

  const { text, toolCalls } = await callOpenAI(messages);

  if (toolCalls && toolCalls.length > 0) {
    for (const tc of toolCalls) {
      if (tc.function?.name === "create_ticket") {
        const args = JSON.parse(tc.function.arguments);
        return await handleTicketCreation(args, context);
      }
    }
  }

  return text || "No pude procesar la respuesta.";
};

// --- 4. OpenAI ---
async function callOpenAI(messages: ChatMessage[]) {
  const resp = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${OPENAI_API_KEY}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: OPENAI_MODEL,
      temperature: AI_TEMPERATURE,
      messages,
      tools,
      tool_choice: "auto"
    })
  });

  const data = (await resp.json()) as OpenAIResponse;
  const first = data?.choices?.[0]?.message;
  return { text: first?.content, toolCalls: first?.tool_calls || [] };
}

// --- 5. Orquestador principal ---
async function handleTicketCreation(args: any, context: any): Promise<string> {
  const name        = args.name        || context.name;
  const email       = args.email       || context.email;
  const phone       = args.phone       || context.phone;
  const company     = args.company     || context.company;
  const description = args.description || "";
  const subject     = `[WhatsApp] ${company} - ${description.slice(0, 60)}`;

  // Validaciones
  const missing = [];
  if (!name)        missing.push("nombre");
  if (!email)       missing.push("correo electrónico");
  if (!phone)       missing.push("teléfono");
  if (!company)     missing.push("empresa");
  if (!description) missing.push("descripción del problema");

  if (missing.length > 0) {
    return `Aún me faltan algunos datos para crear el ticket: ${missing.join(", ")}. ¿Me los puedes indicar?`;
  }

  console.log(`[TICKET] Iniciando creación — ${name} | ${email} | ${phone} | ${company}`);

  // RIDS + Freshdesk en paralelo
  const [ridsResult, fdResult] = await Promise.allSettled([
    createTicketFromWhatsapp({
      email, company, subject, description,
      transcript: context.transcript || [],
      phone, name,
    }),
    createFreshdeskTicket({ name, email, phone, company, subject, description, transcript: context.transcript || [] }),
  ]);

  const ridsOk   = ridsResult.status === "fulfilled" && ridsResult.value?.ok;
  const fdOk     = fdResult.status   === "fulfilled" && !!fdResult.value?.id;
  const ticketId = ridsOk ? String(ridsResult.value.ticketId) : fdOk ? String((fdResult.value as any).id) : null;
  const summary  = `${description.slice(0, 120)}${description.length > 120 ? "..." : ""}`;

  if (ridsOk) {
    console.log(`[RIDS] ✅ Ticket #${(ridsResult.value as any).ticketId}`);
  } else {
    console.error("[RIDS] ❌", ridsResult.status === "rejected" ? (ridsResult as any).reason : (ridsResult.value as any)?.error);
  }

  if (fdOk) {
    console.log(`[FD] ✅ Ticket #${(fdResult.value as any).id}`);
  } else {
    console.error("[FD] ❌", fdResult.status === "rejected" ? (fdResult as any).reason : "sin ID");
  }

  if (!ridsOk && !fdOk) {
    return "Hubo un problema creando el ticket. Por favor intenta nuevamente o contáctanos directamente a soporte@rids.cl.";
  }

  // Correo de confirmación al usuario (no bloqueante)
  sendTicketCreatedEmail(email, ticketId!, summary).catch(err =>
    console.error("[EMAIL] Error enviando confirmación:", err)
  );

  return `✅ Tu ticket #${ticketId} fue creado exitosamente, ${name}. Te enviaremos un correo de confirmación a ${email} con los detalles. Tiempo estimado de respuesta: 2 a 4 horas hábiles.`;
}

// --- 6. Freshdesk API ---
async function createFreshdeskTicket(data: {
  name: string;
  email: string;
  phone: string;
  company: string;
  subject: string;
  description: string;
  transcript: Array<{ from: "client" | "bot"; text: string }>;
}) {
  if (!FD_API_KEY) {
    console.warn("[FD] FD_API_KEY no definida — saltando Freshdesk");
    return null;
  }

  const transcriptHtml = data.transcript
    .map(t => `<p><b>${t.from === "client" ? data.name : "RIDSI"}:</b> ${t.text}</p>`)
    .join("");

  const body = {
    name:     data.name,
    email:    data.email,
    phone:    data.phone,
    subject:  data.subject,
    description: `
      <div style="font-family:sans-serif;">
        <p><strong>Empresa:</strong> ${data.company}</p>
        <p><strong>Teléfono:</strong> ${data.phone}</p>
        <p><strong>Problema:</strong> ${data.description}</p>
        <hr/>
        <p><strong>Conversación WhatsApp:</strong></p>
        ${transcriptHtml}
      </div>
    `,
    status:       2,          // Open
    priority:     2,          // Medium
    source:       7,          // Chat
    type:         "Whatsapp",
    responder_id: Number(process.env.FD_DEFAULT_AGENT_ID) || undefined,
  };

  const credentials = Buffer.from(`${FD_API_KEY}:X`).toString("base64");

  const resp = await fetch(`https://${FD_DOMAIN}/api/v2/tickets`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${credentials}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  const result = await resp.json() as any;
  console.log("[FD] Status:", resp.status);

  if (!resp.ok) {
    console.error("[FD] Error:", JSON.stringify(result));
    return null;
  }

  return result;
}