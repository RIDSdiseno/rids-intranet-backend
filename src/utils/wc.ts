// src/utils/wc.ts

// Si usas Node < 18, descomenta estas 2 líneas:
// import fetch from "node-fetch";
// (globalThis as any).fetch = fetch;

export type WcTextPayload = {
  to: string;
  type: "text";
  text: { body: string };
};

const WC_URL = process.env.WC_URL;
const WC_TOKEN = process.env.WC_TOKEN;

// Opcional: timeout configurable
const REQUEST_TIMEOUT_MS = Number(process.env.REQUEST_TIMEOUT_MS || 15000);

export async function wcSendText(to: string, body: string): Promise<void> {
  console.log(`[WC OUTBOUND] -> ${to}: ${body}`);

  if (!WC_URL) {
    console.error("[WC SEND ERROR] WC_URL no está definido en el .env");
    return;
  }

  const payload: WcTextPayload = {
    to,
    type: "text",
    text: { body },
  };

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (WC_TOKEN) headers.Authorization = `Bearer ${WC_TOKEN}`;

  // Timeout con AbortController
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const resp = await fetch(WC_URL, {
      method: "POST",
      headers,
      body: JSON.stringify(payload),
      signal: controller.signal,
    });

    clearTimeout(id);

    if (!resp.ok) {
      const txt = await resp.text().catch(() => "");
      console.error(`[WC SEND ERROR] ${resp.status} ${txt}`);
    }
  } catch (e) {
    console.error("[WC SEND ERROR]", e);
  }
}
