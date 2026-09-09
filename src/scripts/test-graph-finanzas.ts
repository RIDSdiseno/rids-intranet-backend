import "dotenv/config";

import {
    Client,
} from "@microsoft/microsoft-graph-client";

import {
    ClientSecretCredential,
} from "@azure/identity";

import "isomorphic-fetch";

async function main() {
    const tenantId =
        process.env.MICROSOFT_TENANT_ID;

    const clientId =
        process.env.MICROSOFT_CLIENT_ID;

    const clientSecret =
        process.env.MICROSOFT_CLIENT_SECRET;

    const senderEmail =
        (
            process.env.GRAPH_FINANZAS_USER ||
            "administracion@rids.cl"
        )
            .trim()
            .toLowerCase();

    const destinatario =
        "soporte@rids.cl";

    if (
        !tenantId ||
        !clientId ||
        !clientSecret
    ) {
        throw new Error(
            "Faltan MICROSOFT_TENANT_ID, MICROSOFT_CLIENT_ID o MICROSOFT_CLIENT_SECRET."
        );
    }

    const credential =
        new ClientSecretCredential(
            tenantId,
            clientId,
            clientSecret
        );

    const client =
        Client.init({
            authProvider:
                async (
                    done
                ) => {
                    try {
                        const token =
                            await credential.getToken(
                                "https://graph.microsoft.com/.default"
                            );

                        done(
                            null,
                            token.token
                        );
                    } catch (
                    error
                    ) {
                        done(
                            error as Error,
                            null
                        );
                    }
                },
        });

    console.log(
        "[TEST GRAPH FINANZAS] Iniciando",
        {
            from:
                senderEmail,

            to:
                destinatario,
        }
    );

    const inicio =
        Date.now();

    await client
        .api(
            `/users/${encodeURIComponent(
                senderEmail
            )}/sendMail`
        )
        .post({
            message: {
                subject:
                    "Prueba Microsoft Graph Finanzas",

                body: {
                    contentType:
                        "HTML",

                    content:
                        `
                            <h2>Prueba Graph Finanzas</h2>

                            <p>
                                Correo enviado desde
                                <strong>
                                    ${senderEmail}
                                </strong>
                                utilizando Microsoft Graph.
                            </p>
                        `,
                },

                toRecipients: [
                    {
                        emailAddress: {
                            address:
                                destinatario,
                        },
                    },
                ],
            },

            saveToSentItems:
                true,
        });

    const duracionMs =
        Date.now() -
        inicio;

    console.log(
        "[TEST GRAPH FINANZAS] ✅ Correo enviado",
        {
            from:
                senderEmail,

            to:
                destinatario,

            duracionMs,

            duracionSegundos:
                Number(
                    (
                        duracionMs /
                        1000
                    ).toFixed(
                        2
                    )
                ),
        }
    );
}

main()
    .catch(
        (
            error
        ) => {
            console.error(
                "[TEST GRAPH FINANZAS] ❌ Error",
                error
            );

            process.exit(
                1
            );
        }
    );