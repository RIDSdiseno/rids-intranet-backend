// utils/ai.ts
const PROVIDER = process.env.AI_PROVIDER || "openai";
const OPENAI_API_KEY = process.env.OPENAI_API_KEY || "";
const OPENAI_MODEL = process.env.OPENAI_MODEL || "gpt-4.1-mini";
const AI_TEMPERATURE = Number(process.env.AI_TEMPERATURE ?? 0.2);
// URL del flujo de Power Automate que crea el ticket en Freshdesk
const PA_TICKET_URL = process.env.PA_TICKET_URL || "";
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
-si el usuario pide ser derivado con un tecnico o personal de soporte tienes que enviar un mensaje diciendo que se genero su ticket y que un tecnico se contactara con el a la brevedad posible pero antes de eso te debe enviar su correo y empresa.
  "Para generar tu ticket, ¿me compartes tu [dato faltante]?"

Estilo y formato:
— Español claro (chileno neutro), profesional y amable.
— Respuestas concisas (2–5 frases). Si procede, usa pasos numerados.
-necesito que despues de que el cliente envie su problema le preguntes si quiere que le generes un ticket para que un tecnico se contacte con el pero antes de eso te debe enviar su correo y empresa y debes terminar con se ha generado tu ticket gracias por contactarte con RIDSI tu bot de confiaza.
— Máximo UNA pregunta de clarificación.
— No repitas lo ya dicho ni pidas datos que ya entregó el usuario.
— Quédate SIEMPRE en ventas o soporte.
- Necesito que vayas aprendiendo de cada interacción para mejorar tus respuestas futuras.
- si el cliente te dice que esta bien despues de haber sido generado el ticket tienes que responderle con: "Gracias por contactarte con RIDSI tu bot de confianza, que tengas un excelente día."
`;
// -----------------------------------------------------------------------------
// Herramienta: create_freshdesk_ticket (para que la IA dispare el flujo de PA)
// -----------------------------------------------------------------------------
const tools = [
    {
        type: "function",
        function: {
            name: "create_freshdesk_ticket",
            description: "Crear ticket en Freshdesk a través de Power Automate con correo, empresa y transcript. Úsala solo cuando el cliente confirme que quiere generar ticket y ya se cuente con email y empresa válidos.",
            parameters: {
                type: "object",
                properties: {
                    email: { type: "string", description: "Correo del solicitante" },
                    company: { type: "string", description: "Nombre de la empresa" },
                    subject: { type: "string", description: "Asunto corto del ticket" },
                    transcript: {
                        type: "array",
                        description: "Conversación reciente para adjuntar al ticket (ordenada)",
                        items: {
                            type: "object",
                            properties: {
                                from: { type: "string", enum: ["client", "bot"] },
                                text: { type: "string" }
                            },
                            required: ["from", "text"]
                        }
                    },
                    tags: {
                        type: "array",
                        items: { type: "string" },
                        description: "Etiquetas, ej: ['whatsapp','chatbot']"
                    },
                    priority: { type: "number", enum: [1, 2, 3, 4] },
                    status: { type: "number", enum: [2, 3, 4, 5] }
                },
                required: ["email", "company", "subject", "transcript"]
            }
        }
    }
];
// -----------------------------------------------------------------------------
// Llamado a OpenAI
// -----------------------------------------------------------------------------
async function callOpenAI(messages) {
    if (!OPENAI_API_KEY) {
        return {
            text: "Hola 👋 Para generar tu ticket, ¿me compartes tu correo y el nombre de tu empresa?",
            toolCalls: []
        };
    }
    const resp = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
            Authorization: `Bearer ${OPENAI_API_KEY}`,
            "Content-Type": "application/json"
        },
        body: JSON.stringify({
            model: OPENAI_MODEL,
            temperature: AI_TEMPERATURE,
            max_tokens: 320,
            frequency_penalty: 0.2,
            presence_penalty: 0.0,
            messages,
            tools,
            tool_choice: "auto"
        })
    });
    if (!resp.ok) {
        const t = await resp.text().catch(() => "");
        console.error("OpenAI error:", resp.status, t);
        return { text: null, toolCalls: [] };
    }
    const data = (await resp.json());
    const first = data?.choices?.[0];
    const content = (first?.message?.content ?? "") || null;
    const toolCalls = first?.message?.tool_calls ?? [];
    return { text: content?.trim() || null, toolCalls };
}
// -----------------------------------------------------------------------------
// Helper: disparar creación de ticket a Power Automate
// -----------------------------------------------------------------------------
async function sendTicketToPowerAutomate(payload) {
    if (!PA_TICKET_URL) {
        console.warn("PA_TICKET_URL no está configurada; omitiendo POST");
        return null;
    }
    // Convertimos el transcript en un string para el campo "conversation"
    const conversationText = payload.transcript
        ?.map((t) => `${t.from === "client" ? "Cliente" : "Bot"}: ${t.text}`)
        .join("\n") || "";
    const bodyForPA = {
        name: payload.name,
        email: payload.email,
        company: payload.company,
        phone: payload.phone,
        conversation: conversationText,
        // Podemos enviar las tags como "intent" o una combinación
        intent: payload.tags && payload.tags.length > 0
            ? payload.tags.join(",")
            : "whatsapp"
    };
    const resp = await fetch(PA_TICKET_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(bodyForPA)
    });
    if (!resp.ok) {
        const t = await resp.text().catch(() => "");
        throw new Error(`Power Automate error HTTP ${resp.status}: ${t}`);
    }
    return await resp.json().catch(() => ({}));
}
// -----------------------------------------------------------------------------
// Orquestación
// -----------------------------------------------------------------------------
export async function runAI(input) {
    if (PROVIDER !== "openai") {
        throw new Error(`Proveedor IA no soportado: ${PROVIDER}`);
    }
    const user = input.userText?.trim() || "";
    const turns = input.context?.turns ?? 1;
    const email = input.context?.email;
    const company = input.context?.company;
    const name = input.context?.name;
    const phone = input.context?.phone;
    const transcript = input.context?.transcript || [];
    const prev = input.context?.lastUserMsg
        ? `\n[prev_user]: ${input.context.lastUserMsg}`
        : "";
    const prevBot = input.context?.lastAIReply
        ? `\n[prev_bot]: ${input.context.lastAIReply}`
        : "";
    const escalateLine = turns >= 10
        ? "\nSi la conversación suma 10 turnos o más, agrega al final: '¿Quieres que derive tu caso a un ejecutivo humano?'"
        : "";
    // Hechos de sesión explícitos
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
Cuando el usuario confirme que desea generar ticket y ambos datos estén, llama a la función create_freshdesk_ticket.
`;
    const messages = [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: `${user}${prev}${prevBot}` }
    ];
    // 1) Llamada a OpenAI (puede devolver text y/o toolCalls)
    const { text, toolCalls } = await callOpenAI(messages);
    // 2) Si hay toolCalls → ejecutar creación de ticket vía Power Automate
    if (toolCalls && toolCalls.length > 0) {
        for (const tc of toolCalls) {
            if (tc.type === "function" &&
                tc.function?.name === "create_freshdesk_ticket") {
                try {
                    const args = JSON.parse(tc.function.arguments || "{}");
                    const payload = {
                        name: name || args.name,
                        email: args.email || email || "",
                        company: args.company || company || "",
                        phone: phone || args.phone,
                        subject: args.subject ||
                            `Soporte WhatsApp - ${args.company || company || "Cliente"}`,
                        transcript: (args.transcript || transcript),
                        tags: args.tags || ["whatsapp", "chatbot"],
                        priority: args.priority || 2,
                        status: args.status || 2
                    };
                    // Validar mínimos
                    if (!payload.email || !payload.company) {
                        const faltante = !payload.email && !payload.company
                            ? "correo y empresa"
                            : !payload.email
                                ? "correo"
                                : "empresa";
                        return `Para generar tu ticket, ¿me compartes tu ${faltante}?`;
                    }
                    // Disparar Power Automate
                    await sendTicketToPowerAutomate(payload);
                    // Mensaje final obligatorio según tus reglas
                    return "Se ha generado tu ticket, gracias por contactarte con RIDSI, tu bot de confianza. Un técnico se comunicará contigo a la brevedad.";
                }
                catch (e) {
                    console.error("Error creando ticket vía Power Automate:", e?.message || e);
                    return "Ocurrió un problema al crear tu ticket 😓. ¿Me confirmas nuevamente tu correo y empresa para reintentar?";
                }
            }
        }
    }
    // 3) Si NO hubo tool call: responder con el texto de la IA (o fallback)
    if (text && text.length > 0) {
        return text;
    }
    return "Tuve un problema procesando tu mensaje 😓. ¿Lo intentamos de nuevo? (Ventas o soporte) Para generar tu ticket, ¿me compartes tu correo y el nombre de tu empresa?";
}
//# sourceMappingURL=ai.js.map