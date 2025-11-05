import fetch from "node-fetch";
const WC_API = process.env.WATCHCHIMP_API_URL || ""; // ej: https://api.whatchimp.com
const WC_TOKEN = process.env.WATCHCHIMP_TOKEN || "";
const WC_SENDER = process.env.WATCHCHIMP_SENDER || ""; // tu número remitente
export async function wcSendText(to, body) {
    if (!WC_API)
        return;
    await fetch(`${WC_API}/messages`, {
        method: "POST",
        headers: {
            Authorization: `Bearer ${WC_TOKEN}`,
            "Content-Type": "application/json"
        },
        body: JSON.stringify({
            from: WC_SENDER,
            to,
            type: "text",
            text: { body }
        })
    });
}
//# sourceMappingURL=wc.js.map