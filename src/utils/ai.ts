// --- 1. Definición de Tipos Locales (Elimina errores de import y de 'choices') ---
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

// Interfaz para que TypeScript entienda la respuesta de OpenAI
interface OpenAIResponse {
  choices: Array<{
    message: {
      content: string | null;
      tool_calls?: any[];
    };
  }>;
}

const OPENAI_API_KEY = process.env.OPENAI_API_KEY || "";
const OPENAI_MODEL = process.env.OPENAI_MODEL || "gpt-4-turbo";
const AI_TEMPERATURE = Number(process.env.AI_TEMPERATURE ?? 0.2);
const PA_TICKET_URL = process.env.PA_TICKET_URL || "";

// --- 2. Herramientas para Freshdesk ---
const tools = [
  {
    type: "function",
    function: {
      name: "create_freshdesk_ticket",
      description: "Crea un ticket en Freshdesk.",
      parameters: {
        type: "object",
        properties: {
          email: { type: "string" },
          company: { type: "string" },
          subject: { type: "string" }
        },
        required: ["email", "company", "subject"]
      }
    }
  }
];

// --- 3. Lógica Principal de Razonamiento ---
export const runAI = async ({ userText, context }: RunAIInput): Promise<string> => {
  const systemPrompt = `Eres RIDSI, asesor de soporte y ventas. Empresa: ${context.company || "PENDIENTE"}. Analiza el historial para no repetir preguntas.`;

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
      if (tc.function?.name === "create_freshdesk_ticket") {
        const args = JSON.parse(tc.function.arguments);
        return await handleFreshdeskFlow(args, context);
      }
    }
  }
  return text || "No pude procesar la respuesta.";
};

// --- 4. Funciones Auxiliares (Asegúrate de que estas existan al final del archivo) ---
async function callOpenAI(messages: ChatMessage[]) {
  const resp = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${OPENAI_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model: OPENAI_MODEL, temperature: AI_TEMPERATURE, messages, tools, tool_choice: "auto" })
  });
  
  // Aquí aplicamos el tipo para eliminar el error de 'choices'
  const data = (await resp.json()) as OpenAIResponse;
  const first = data?.choices?.[0]?.message;
  return { text: first?.content, toolCalls: first?.tool_calls || [] };
}

async function handleFreshdeskFlow(args: any, context: any) {
  const payload = {
    email: args.email || context.email,
    company: args.company || context.company,
    subject: args.subject || "Soporte WhatsApp",
    transcript: context.transcript
  };
  if (!payload.email || !payload.company) return "Falta correo o empresa para el ticket.";
  await sendTicketToPowerAutomate(payload);
  return "Se ha generado tu ticket, gracias por contactarte con RIDSI.";
}

async function sendTicketToPowerAutomate(payload: any) {
  if (!PA_TICKET_URL) return;
  await fetch(PA_TICKET_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
}