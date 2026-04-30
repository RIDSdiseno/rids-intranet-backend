import axios from "axios";
import { createSiiApiLog } from "./sii-api-log.service.js";
import { getSimpleApiKey } from "./sii-api-auth.service.js";
const SIMPLEAPI_BASE_URL = process.env.SIMPLEAPI_BASE_URL ?? "https://servicios.simpleapi.cl";
export async function siiApiRequest({ empresaKey, empresaConfig, endpoint, method = "GET", params, }) {
    const startedAt = Date.now();
    const url = `${SIMPLEAPI_BASE_URL}${endpoint}`;
    const apiKey = getSimpleApiKey();
    const body = method === "POST"
        ? {
            RutEmpresa: empresaConfig.rutEmpresa,
            ClaveSII: empresaConfig.claveSii,
            RutRepresentante: empresaConfig.rutRepresentante,
            ...(params ?? {}),
        }
        : undefined;
    try {
        console.log("📡 SII API REQUEST:", {
            empresaKey,
            rutEmpresa: empresaConfig.rutEmpresa,
            method,
            url,
        });
        console.log("📦 BODY ENVIADO:", JSON.stringify(body, null, 2));
        console.log("🏢 EMPRESA CONFIG:", {
            rutEmpresa: empresaConfig.rutEmpresa,
            claveSii: empresaConfig.claveSii ? `${empresaConfig.claveSii.slice(0, 3)}***` : "❌ VACÍA",
            rutRepresentante: empresaConfig.rutRepresentante || "❌ VACÍO",
        });
        const response = await axios.request({
            method,
            url,
            params: method === "GET" ? params : undefined,
            data: body,
            timeout: 30000,
            headers: {
                Authorization: apiKey,
                "Content-Type": "application/json",
                Accept: "application/json",
            },
            validateStatus: () => true,
        });
        const durationMs = Date.now() - startedAt;
        const ok = response.status >= 200 && response.status < 300;
        await createSiiApiLog({
            empresaKey,
            rutEmpresa: empresaConfig.rutEmpresa,
            endpoint,
            method,
            status: response.status,
            ok,
            error: ok ? null : JSON.stringify(response.data),
            durationMs,
        });
        console.log("📥 SII API RESPONSE:", {
            empresaKey,
            status: response.status,
            durationMs,
            data: ok ? undefined : response.data,
            errors: !ok ? JSON.stringify(response.data?.errors) : undefined, // ← ESTO
        });
        if (response.status === 401) {
            throw new Error(`SimpleAPI 401: API Key inválida o sin cuota disponible`);
        }
        if (response.status === 429) {
            throw new Error(`SimpleAPI 429: límite de peticiones excedido`);
        }
        if (!ok) {
            throw new Error(`SimpleAPI ${response.status}: ${JSON.stringify(response.data)}`);
        }
        return response.data;
    }
    catch (error) {
        const durationMs = Date.now() - startedAt;
        await createSiiApiLog({
            empresaKey,
            rutEmpresa: empresaConfig.rutEmpresa,
            endpoint,
            method,
            status: null,
            ok: false,
            error: error instanceof Error ? error.message : "Error desconocido",
            durationMs,
        });
        console.error("❌ SII API ERROR:", { empresaKey, endpoint, error });
        throw error;
    }
}
//# sourceMappingURL=sii-api-client.service.js.map