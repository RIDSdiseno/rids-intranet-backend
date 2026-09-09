// src/service/baseapi/graph-finanzas.service.ts
import { Client, } from "@microsoft/microsoft-graph-client";
import { ClientSecretCredential, } from "@azure/identity";
import "isomorphic-fetch";
/* =========================================================
   SERVICE
========================================================= */
class GraphFinanzasService {
    client = null;
    getSenderEmail() {
        const sender = (process.env
            .GRAPH_FINANZAS_USER ||
            "")
            .trim()
            .toLowerCase();
        if (!sender) {
            throw new Error("GRAPH_FINANZAS_USER no está configurado.");
        }
        return sender;
    }
    /* =====================================================
       CLIENT
    ===================================================== */
    async getClient() {
        if (this.client) {
            return this.client;
        }
        const tenantId = process.env
            .MICROSOFT_TENANT_ID;
        const clientId = process.env
            .MICROSOFT_CLIENT_ID;
        const clientSecret = process.env
            .MICROSOFT_CLIENT_SECRET;
        if (!tenantId ||
            !clientId ||
            !clientSecret) {
            throw new Error("Configuración Microsoft Graph incompleta para Finanzas.");
        }
        const credential = new ClientSecretCredential(tenantId, clientId, clientSecret);
        this.client =
            Client.init({
                authProvider: async (done) => {
                    try {
                        const token = await credential
                            .getToken("https://graph.microsoft.com/.default");
                        if (!token) {
                            throw new Error("Microsoft Graph no devolvió un access token.");
                        }
                        done(null, token.token);
                    }
                    catch (error) {
                        done(error, null);
                    }
                },
            });
        return this.client;
    }
    /* =====================================================
       SEND MAIL
    ===================================================== */
    async sendMail(params) {
        const client = await this.getClient();
        const senderEmail = this.getSenderEmail();
        const destinatarios = (Array.isArray(params.to)
            ? params.to
            : [
                params.to,
            ])
            .map((value) => value
            .trim()
            .toLowerCase())
            .filter(Boolean);
        const copias = (params.cc ??
            [])
            .map((value) => value
            .trim()
            .toLowerCase())
            .filter(Boolean);
        if (destinatarios.length ===
            0) {
            throw new Error("No hay destinatarios válidos para el correo financiero.");
        }
        const inicio = Date.now();
        console.log("[GRAPH FINANZAS] 📤 Enviando correo", {
            from: senderEmail,
            to: destinatarios,
            cc: copias,
            subject: params.subject,
            adjuntos: params
                .attachments
                ?.length ??
                0,
        });
        await client
            .api(`/users/${encodeURIComponent(senderEmail)}/sendMail`)
            .post({
            message: {
                subject: params.subject,
                body: {
                    contentType: "HTML",
                    content: params.bodyHtml,
                },
                toRecipients: destinatarios.map((address) => ({
                    emailAddress: {
                        address,
                    },
                })),
                ccRecipients: copias.map((address) => ({
                    emailAddress: {
                        address,
                    },
                })),
                attachments: (params
                    .attachments ??
                    []).map((attachment) => ({
                    "@odata.type": "#microsoft.graph.fileAttachment",
                    name: attachment.name,
                    contentType: attachment.contentType,
                    contentBytes: attachment.contentBytes,
                })),
            },
            saveToSentItems: true,
        });
        const duracionMs = Date.now() -
            inicio;
        console.log("[GRAPH FINANZAS] ✅ Correo enviado", {
            from: senderEmail,
            to: destinatarios,
            duracionMs,
            duracionSegundos: Number((duracionMs /
                1000).toFixed(2)),
        });
        return {
            ok: true,
            duracionMs,
        };
    }
}
export const graphFinanzasService = new GraphFinanzasService();
//# sourceMappingURL=graph-finanzas.service.js.map