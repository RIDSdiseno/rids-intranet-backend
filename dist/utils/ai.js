import { createTicketFromWhatsapp, searchEmpresaByName } from "../service/whatchimp-ticket.service.js";
import { sendTicketCreatedEmail } from "../service/email.service.js";
const OPENAI_API_KEY = process.env.OPENAI_API_KEY || "";
const OPENAI_MODEL = process.env.OPENAI_MODEL || "gpt-4-turbo";
const AI_TEMPERATURE = Number(process.env.AI_TEMPERATURE ?? 0.2);
const FD_API_KEY = process.env.FD_API_KEY || "";
const FD_DOMAIN = "rids.freshdesk.com";
// --- 2. Tools ---
const tools = [
    {
        type: "function",
        function: {
            name: "search_company",
            description: "Busca empresas registradas en el sistema. Llama esta función SIEMPRE antes de create_ticket. Si ya tienes el correo del usuario, inclúyelo en 'email' — el sistema lo usará para identificar la empresa por dominio de forma automática y exacta.",
            parameters: {
                type: "object",
                properties: {
                    query: { type: "string", description: "Nombre o parte del nombre de la empresa" },
                    email: { type: "string", description: "Correo electrónico del usuario (opcional pero recomendado)" },
                },
                required: ["query"],
            },
        },
    },
    {
        type: "function",
        function: {
            name: "create_ticket",
            description: "Crea un ticket de soporte. Llama esta función SOLO cuando tengas los 5 datos obligatorios y ya hayas confirmado el nombre exacto de la empresa con search_company.",
            parameters: {
                type: "object",
                properties: {
                    name: { type: "string", description: "Nombre completo del contacto" },
                    email: { type: "string", description: "Correo electrónico del contacto" },
                    phone: { type: "string", description: "Teléfono del contacto" },
                    company: { type: "string", description: "Nombre EXACTO de la empresa tal como lo retornó search_company" },
                    description: { type: "string", description: "Descripción detallada del problema técnico" },
                },
                required: ["name", "email", "phone", "company", "description"]
            }
        }
    }
];
// --- 3. Lógica Principal ---
export const runAI = async ({ userText, context }) => {
    console.log("-----------------------------------------");
    console.log("MENSAJE RECIBIDO:", userText);
    console.log("CONTEXTO:", { email: context.email, company: context.company, name: context.name, phone: context.phone });
    console.log("-----------------------------------------");
    const userName = context.name ? context.name.split(" ")[0] : null;
    const greeting = userName ? `Hola ${userName}` : "Hola";
    const systemPrompt = `
Eres RIDSI, el asistente técnico experto de RIDS. Tu ÚNICA misión es ayudar con problemas informáticos y gestionar tickets de soporte.

${userName ? `El nombre del usuario es "${context.name}". Usa "${userName}" para dirigirte a él/ella de forma natural.` : ""}

REGLAS:
1. Si es el primer mensaje del usuario (turns = ${context.turns ?? 1}), salúdalo con "${greeting}, soy RIDSI, el asistente técnico de RIDS. ¿En qué te puedo ayudar hoy?".
2. PROHIBIDO: Temas no informáticos (cocina, ocio, cultura general, deportes, etc.).
3. RESPUESTA ANTE LO PROHIBIDO: "Lo siento, como asistente técnico de RIDS solo puedo ayudarte con temas relacionados a informática, soporte y nuestros servicios. ¿En qué problema técnico te puedo apoyar hoy?".
4. FLUJO DE TICKETS: Para generar un ticket necesito 5 datos. Cuando los solicites, pídelos así (EXACTAMENTE con este formato, sin numeración ni lista):
   "Para poder ayudarte y generar un ticket de soporte, por favor escríbeme en una sola línea y separado por comas: nombre completo, correo electrónico, teléfono, nombre de la empresa y descripción del problema.
   Ejemplo: Juan Pérez, juan@empresa.cl, 912345678, Empresa SA, mi pc no enciende"
5. Si el usuario entrega varios datos a la vez, captúralos todos. Pide solo los que faltan usando el mismo formato de línea única separada por comas.
6. CREACIÓN DEL TICKET: Una vez que tengas los 5 datos, llama INMEDIATAMENTE create_ticket. El sistema resuelve la empresa automáticamente por el dominio del correo. Solo usa search_company si el usuario menciona un nombre de empresa ambiguo o desconocido y quieres verificarlo antes de crear el ticket.
7. DESPUÉS de que create_ticket se ejecute, informa al usuario que el ticket fue creado con su número y que recibirá un correo de confirmación con los detalles en 2 a 4 horas hábiles.

Mantén un tono profesional, directo y enfocado en la solución técnica.
  `.trim();
    const messages = [
        { role: "system", content: systemPrompt },
        ...(context.transcript || []).map(t => ({
            role: (t.from === "bot" ? "assistant" : "user"),
            content: t.text
        })),
        { role: "user", content: userText }
    ];
    // Loop agentico: permite search_company → create_ticket en una sola vuelta sin responder al usuario
    const loopMessages = [...messages];
    const MAX_ITER = 5;
    for (let i = 0; i < MAX_ITER; i++) {
        const { text, toolCalls } = await callOpenAI(loopMessages);
        if (!toolCalls || toolCalls.length === 0) {
            return text || "No pude procesar la respuesta.";
        }
        const tc = toolCalls[0];
        // Agrega el mensaje del assistant con la tool call al historial
        loopMessages.push({ role: "assistant", content: text ?? null, tool_calls: toolCalls });
        if (tc.function?.name === "search_company") {
            const args = JSON.parse(tc.function.arguments);
            console.log(`[AI] search_company("${args.query}", email="${args.email ?? ""}")`);
            const results = await searchEmpresaByName(args.query, args.email);
            console.log(`[AI] search_company results:`, results.map(r => r.nombre));
            loopMessages.push({
                role: "tool",
                tool_call_id: tc.id,
                content: JSON.stringify(results.length > 0
                    ? { found: true, companies: results.map(r => r.nombre) }
                    : { found: false, message: "No se encontraron empresas con ese nombre en el sistema." }),
            });
            continue;
        }
        if (tc.function?.name === "create_ticket") {
            const args = JSON.parse(tc.function.arguments);
            return await handleTicketCreation(args, context);
        }
        // Tool desconocida — salir del loop
        return text || "No pude procesar la respuesta.";
    }
    return "No pude completar la operación. Por favor intenta nuevamente.";
};
// --- 4. OpenAI ---
async function callOpenAI(messages) {
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
    const data = (await resp.json());
    const first = data?.choices?.[0]?.message;
    return { text: first?.content, toolCalls: first?.tool_calls || [] };
}
// --- 5. Orquestador principal ---
async function handleTicketCreation(args, context) {
    const name = args.name || context.name;
    const email = args.email || context.email;
    const phone = args.phone || context.phone;
    const company = args.company || context.company;
    const description = args.description || "";
    const subject = `[WhatsApp] ${company} - ${description.slice(0, 60)}`;
    // Validaciones
    const missing = [];
    if (!name)
        missing.push("nombre");
    if (!email)
        missing.push("correo electrónico");
    if (!phone)
        missing.push("teléfono");
    if (!company)
        missing.push("empresa");
    if (!description)
        missing.push("descripción del problema");
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
    const ridsOk = ridsResult.status === "fulfilled" && ridsResult.value?.ok;
    const fdOk = fdResult.status === "fulfilled" && !!fdResult.value?.id;
    const ticketId = ridsOk ? String(ridsResult.value.ticketId) : fdOk ? String(fdResult.value.id) : null;
    const summary = `${description.slice(0, 120)}${description.length > 120 ? "..." : ""}`;
    if (ridsOk) {
        console.log(`[RIDS] ✅ Ticket #${ridsResult.value.ticketId}`);
    }
    else {
        console.error("[RIDS] ❌", ridsResult.status === "rejected" ? ridsResult.reason : ridsResult.value?.error);
    }
    if (fdOk) {
        console.log(`[FD] ✅ Ticket #${fdResult.value.id}`);
    }
    else {
        console.error("[FD] ❌", fdResult.status === "rejected" ? fdResult.reason : "sin ID");
    }
    if (!ridsOk && !fdOk) {
        return "Hubo un problema creando el ticket. Por favor intenta nuevamente o contáctanos directamente a soporte@rids.cl.";
    }
    // Correo de confirmación al usuario (no bloqueante)
    sendTicketCreatedEmail(email, ticketId, summary).catch(err => console.error("[EMAIL] Error enviando confirmación:", err));
    return `✅ Tu ticket #${ticketId} fue creado exitosamente, ${name}. Te enviaremos un correo de confirmación a ${email} con los detalles. Tiempo estimado de respuesta: 2 a 4 horas hábiles.`;
}
// --- 6. Freshdesk API ---
async function createFreshdeskTicket(data) {
    if (!FD_API_KEY) {
        console.warn("[FD] FD_API_KEY no definida — saltando Freshdesk");
        return null;
    }
    const transcriptHtml = data.transcript
        .map(t => `<p><b>${t.from === "client" ? data.name : "RIDSI"}:</b> ${t.text}</p>`)
        .join("");
    const body = {
        name: data.name,
        email: data.email,
        phone: data.phone,
        subject: data.subject,
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
        status: 2, // Open
        priority: 2, // Medium
        source: 7, // Chat
        type: "Whatsapp",
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
    const result = await resp.json();
    console.log("[FD] Status:", resp.status);
    if (!resp.ok) {
        console.error("[FD] Error:", JSON.stringify(result));
        return null;
    }
    return result;
}
//# sourceMappingURL=ai.js.map