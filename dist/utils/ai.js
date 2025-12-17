// utils/ai.ts
const PROVIDER = process.env.AI_PROVIDER || "openai";
const OPENAI_API_KEY = process.env.OPENAI_API_KEY || "";
const OPENAI_MODEL = process.env.OPENAI_MODEL || "gpt-4.1-mini";
const AI_TEMPERATURE = Number(process.env.AI_TEMPERATURE ?? 0.2);
// URL del flujo de Power Automate que crea el ticket en Freshdesk
const PA_TICKET_URL = process.env.PA_TICKET_URL || "";
// -----------------------------------------------------------------------------
// PROMPT DE CONTROL (ACTUALIZADO / MÁS HUMANO + ANTI-IMPERSONACIÓN)
// -----------------------------------------------------------------------------
const BASE_SYSTEM_PROMPT = `
Eres RIDSI, un asistente por WhatsApp para una empresa de TI en Chile.

Tu objetivo:
— Ayudar de forma cercana, clara y amable en temas de SOPORTE TÉCNICO y VENTAS.
— Acompañar al cliente, hacerle sentir escuchado y guiado, sin sonar robótico.
- PRIORIDAD PRINCIPAL: Cuando el cliente reporta un problema que requiere intervención, soporte o simplemente quiere hablar con un humano, tu objetivo es generar UN TICKET, idealmente que contenga suficiente contexto para que un técnico realice el diagnóstico. IMPORTANTE: No intentes resolver el problema por completo desde el chat.
- Si el usuario confirma que quiere crear el ticket y tienes correo y empresa en contexto, DEBES llamar a la función create_freshdesk_ticket con el transcript completo. No envíes texto adicional antes de llamar a la función salvo una breve confirmación si corresponde.
- NUNCA trates de "diagnosticar profundamente" ni ofrezcas largos pasos técnicos que reemplacen la intervención de un técnico. Si la reparación requiere más de un paso deriva y crea ticket.


Política interna (NO la menciones a menos que el usuario pida algo fuera de ventas o soporte):
— Solo puedes ayudar en: (1) soporte técnico y (2) ventas.
— Si el usuario pide algo distinto, responde de forma breve y empática, por ejemplo:
  "En este canal solo te puedo apoyar con ventas y soporte técnico. Si necesitas otra gestión, puedo derivarte a un ejecutivo."
— No inventes datos, precios ni plazos; si corresponde, ofrece cotización o derivación.

Preguntas sobre quién eres / si eres humano:
— Responder preguntas como "¿con quién hablo?", "¿eres humano?", "¿qué eres tú?" NO se considera chat general.
— Siempre responde de forma transparente y breve, por ejemplo:
  "Soy RIDSI, el asistente virtual de soporte y ventas de la empresa 😊."
— Nunca digas que eres una persona real, un técnico humano ni un miembro del equipo sin aclarar que eres un asistente virtual.
— Después de responder quién eres, encamina de inmediato la conversación a ventas o soporte, por ejemplo:
  "Cuéntame, ¿en qué te puedo ayudar en soporte o ventas?"
— No mantengas conversaciones de ocio o temas generales (chistes, películas, clima, etc.); si el usuario insiste en esos temas, recuérdale que solo puedes ayudar en ventas y soporte.

Tickets y datos obligatorios:
— Solo si falta alguno de estos datos, pídelo al inicio: correo del usuario y nombre de su empresa.
— Si YA están en el contexto de sesión, NO los vuelvas a pedir.
— Si falta solo uno, pide únicamente ese dato.
— Ejemplo de solicitud única cuando falte:
  "Para generar tu ticket, ¿me compartes tu [dato faltante]?"

Flujo con el problema del cliente:
— Primero escucha el problema del cliente y respóndele con una orientación inicial (ventas o soporte).
— Después de que el cliente cuente su problema, pregúntale si quiere que le generes un ticket para que un técnico se contacte con él.
— Antes de generar el ticket DEBES tener correo y empresa:
   • Si falta alguno, pídeselo de forma amable.
   • Cuando tengas los datos, debes llamar a la función create_freshdesk_ticket.
— Una vez generado el ticket, debes terminar con:
  "Se ha generado tu ticket, gracias por contactarte con RIDSI, tu bot de confianza. Un técnico se comunicará contigo a la brevedad."
— Si después de eso el cliente responde algo como "gracias", "ok", "está bien", debes contestar:
  "Gracias por contactarte con RIDSI tu bot de confianza, que tengas un excelente día."

Estilo y tono:
— Español claro (chileno neutro), profesional pero cercano.
— Puedes usar emojis suaves cuando aporten (por ejemplo: 👋😊👍), pero sin abusar.
— Respuestas concisas (2–5 frases). Cuando ayude, usa pasos numerados o viñetas.
— Máximo UNA pregunta de clarificación por mensaje.
— No repitas lo ya dicho ni pidas datos que ya entregó el usuario.
— Quédate SIEMPRE en ventas o soporte (salvo para decir que debes derivar).
- Si el usuario menciona que quiere un ticket, genéralo, no le pidas confirmación varias veces.

Aprendizaje de la conversación:
— Ten en cuenta el historial reciente (transcript) para no repetir preguntas y mejorar tus respuestas dentro de esta sesión.
— Si el usuario ya te mencionó correo, empresa, nombre o teléfono, asúmelos como conocidos en esta sesión.

Recuerda: sé empático, directo y útil. Tu prioridad es crear un ticket para resolver el problema del cliente de forma rápida y amable, siempre dentro de ventas o soporte técnico. 
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
            text: "Hola 👋 Soy RIDSI. Cuéntame en qué te puedo ayudar en ventas o soporte, y si quieres generar un ticket luego, necesitaré tu correo y el nombre de tu empresa.",
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
// Helper: construir resumen a partir del transcript (solo mensajes del cliente)
// -----------------------------------------------------------------------------
async function callOpenAIForSummary(messageText) {
    if (!OPENAI_API_KEY) {
        return {
            text: "Error con el resumen de la conversación.",
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
            messages: [
                { role: "system", content: `Eres un asistente que crea resúmenes breves y claros de conversaciones de clientes en español. 
          Extrae y condensa los puntos clave mencionados por el cliente. Únicamente ten en cuenta el problema del último ticket, si la conversación menciona que ya se ha generado un ticket para un problema anterior
          ignora dicho problema y solo enfocate en el problema actual` },
                { role: "user", content: `Genera un resumen conciso del siguiente texto:\n\n${messageText}` }
            ]
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
    return content?.trim() || "";
    ;
}
async function buildSummaryFromTranscript(transcript) {
    const MAX_CLIENT_MSGS = 6;
    if (!transcript || !transcript.length)
        return "";
    const clientMsgs = transcript
        .filter((t) => t.from === "client")
        .map((t) => t.text.trim())
        .filter(Boolean);
    if (!clientMsgs.length)
        return "";
    const lastMsgs = clientMsgs.length > MAX_CLIENT_MSGS
        ? clientMsgs.slice(MAX_CLIENT_MSGS * -1).join(" | ")
        : clientMsgs.join(" | ");
    const summary = await callOpenAIForSummary(lastMsgs);
    return summary;
}
// -----------------------------------------------------------------------------
// Helper: disparar creación de ticket a Power Automate
// -----------------------------------------------------------------------------
async function sendTicketToPowerAutomate(payload) {
    if (!PA_TICKET_URL) {
        console.warn("PA_TICKET_URL no está configurada; omitiendo POST");
        return null;
    }
    // Resumen automático a partir del transcript
    const resumen = await buildSummaryFromTranscript(payload.transcript);
    // Texto completo de la conversación (resumen + detalle)
    const MAX_NUMBER_OF_MESSAGES = 12;
    const transcript = payload.transcript?.map((t) => `${t.from === "client" ? "Cliente" : "Bot"}: ${t.text}`) || [];
    const transcriptCut = transcript.length > MAX_NUMBER_OF_MESSAGES
        ? transcript?.slice(transcript.length - MAX_NUMBER_OF_MESSAGES).join("\n")
        : transcript?.join("\n");
    const conversationText = (resumen
        ? `Resumen automático:\n${resumen}\n\n--------------------------\n`
        : "") +
        (transcriptCut || "");
    const bodyForPA = {
        name: payload.name,
        email: payload.email,
        company: payload.company,
        phone: payload.phone,
        conversation: conversationText,
        summary: resumen, // <- por si lo quieres mapear a otro campo en el flujo
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
    console.log("Se invoca runAI con input:", input);
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
                        transcript: transcript,
                        tags: args.tags || ["whatsapp", "chatbot"],
                        priority: args.priority || 2,
                        status: args.status || 2
                    };
                    console.log("Largo del payload transcript:", payload.transcript.length);
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