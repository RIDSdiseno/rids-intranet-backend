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
export const runAI = async ({ userText, context }) => {
    // LOG PARA VER SI EL SERVIDOR REALMENTE LEE ESTE ARCHIVO
    console.log("-----------------------------------------");
    console.log("MENSAJE RECIBIDO:", userText);
    console.log("-----------------------------------------");
    const systemPrompt = `
    Eres RIDSI, el asesor tecnológico de RIDS. Tu misión es eliminar el caos técnico y ser el espejo del éxito de nuestros clientes.
    Empresa cliente: ${context.company || "Usuario General"}.

    DIRECTRICES DE RESPUESTA:
    1. PROACTIVIDAD COMERCIAL: Si el usuario menciona "plan", "pyme", "empresa" o intención de compra, el intent DEBE ser "ventas". Ejecuta la acción "redirect" a "PLANES" inmediatamente.
    2. SIEMPRE sugiere un siguiente paso práctico. Si la duda es general, usa: "Para un análisis más profundo, podrías revisar nuestra sección de SERVICIOS".
    3. DETECCIÓN DE OPORTUNIDADES: Ante necesidades de desarrollo o seguridad, cambia el intent a "ventas" y activa la action "redirect" a "PLANES" o "SERVICIOS".
    4. FOCO EN EL ÉXITO: Usa soluciones de https://rids.cl/ (inventario, software a medida) para mostrar transformación.
    5. ELIMINA AMBIGÜEDAD: No preguntes "¿Te gustaría saber más?". Di: "He preparado nuestra tabla de PLANES para que elijas el que mejor se adapte a tus necesidades".
    6. ADAPTACIÓN AL NEGOCIO: Si es un rubro específico (ej. panadería), habla de "agilidad", "control de costos" y "crecimiento".

    REGLAS DE CUMPLIMIENTO (META 2026):
    - Prohibido temas no informáticos (cocina, ocio, cultura general).
    - Respuesta ante lo prohibido: "Lo siento, como asistente técnico de RIDS solo puedo ayudarte con temas relacionados a informática, soporte y nuestros servicios. ¿En qué problema técnico te puedo apoyar hoy?".
  `.trim();
    const messages = [
        { role: "system", content: systemPrompt },
        ...(context.transcript || []).map(t => ({
            role: (t.from === "bot" ? "assistant" : "user"),
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
async function callOpenAI(messages) {
    const resp = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: { Authorization: `Bearer ${OPENAI_API_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({ model: OPENAI_MODEL, temperature: AI_TEMPERATURE, messages, tools, tool_choice: "auto" })
    });
    // Aquí aplicamos el tipo para eliminar el error de 'choices'
    const data = (await resp.json());
    const first = data?.choices?.[0]?.message;
    return { text: first?.content, toolCalls: first?.tool_calls || [] };
}
async function handleFreshdeskFlow(args, context) {
    const payload = {
        email: args.email || context.email,
        company: args.company || context.company,
        subject: args.subject || "Soporte WhatsApp",
        transcript: context.transcript
    };
    if (!payload.email || !payload.company)
        return "Falta correo o empresa para el ticket.";
    await sendTicketToPowerAutomate(payload);
    return "Se ha generado tu ticket, gracias por contactarte con RIDSI.";
}
async function sendTicketToPowerAutomate(payload) {
    if (!PA_TICKET_URL)
        return;
    await fetch(PA_TICKET_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
    });
}
//# sourceMappingURL=ai.js.map