import axios from "axios";
// dominio completo ej: midominio.freshdesk.com
const FD_DOMAIN = process.env.FD_DOMAIN;
const FD_API_KEY = process.env.FD_API_KEY;
export const fd = axios.create({
    baseURL: `https://${FD_DOMAIN}/api/v2`,
    auth: { username: FD_API_KEY, password: "X" },
    headers: { "Content-Type": "application/json" },
    timeout: 20000,
});
// Reintento simple para 429/5xx respetando Retry-After
fd.interceptors.response.use(undefined, async (error) => {
    const status = error?.response?.status;
    if (status === 429 || (status >= 500 && status < 600)) {
        const wait = Number(error?.response?.headers?.["retry-after"] ?? 2);
        await new Promise((r) => setTimeout(r, wait * 1000));
        return fd.request(error.config);
    }
    throw error;
});
//# sourceMappingURL=client.js.map