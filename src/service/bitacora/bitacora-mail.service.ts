// src/service/bitacora/bitacora-mail.service.ts

import {
    transporter,
} from "../../lib/mailer.js";

const SMTP_USER =
    process.env.SMTP_USER?.trim();

const APP_URL =
    (
        process.env.FRONTEND_URL?.trim() ||
        process.env.APP_URL?.trim() ||
        ""
    ).replace(
        /\/+$/,
        ""
    );

type SolicitudRevisionParams = {
    destinatarioEmail:
    string;

    destinatarioNombre:
    string;

    solicitadoPorNombre:
    string;

    bitacoraId:
    number;

    tituloBitacora?:
    string | null;

    etapa:
    string;

    comentarioSolicitud?:
    string | null;
};

type ResultadoRevisionParams = {
    destinatarioEmail:
    string;

    destinatarioNombre:
    string;

    revisorNombre:
    string;

    bitacoraId:
    number;

    tituloBitacora?:
    string | null;

    etapa:
    string;

    aprobada:
    boolean;

    comentarioRespuesta?:
    string | null;
};

function escaparHtml(
    value:
        string | null | undefined
) {
    return String(
        value ?? ""
    )
        .replace(
            /&/g,
            "&amp;"
        )
        .replace(
            /</g,
            "&lt;"
        )
        .replace(
            />/g,
            "&gt;"
        )
        .replace(
            /"/g,
            "&quot;"
        )
        .replace(
            /'/g,
            "&#039;"
        );
}

function obtenerNombreEtapa(
    etapa:
        string
) {
    switch (
    etapa
    ) {
        case "ANTES":
            return "Antes";

        case "EN_PROCESO":
            return "En proceso";

        case "DESPUES":
            return "Después";

        default:
            return etapa;
    }
}

function obtenerLinkBitacora(
    bitacoraId:
        number
) {
    if (
        !APP_URL
    ) {
        return null;
    }

    return `${APP_URL}/bitacora-tecnico?bitacoraId=${bitacoraId}`;
}

/* =====================================================
   SOLICITUD DE REVISIÓN
===================================================== */

export async function enviarCorreoSolicitudRevisionBitacora(
    params:
        SolicitudRevisionParams
) {
    if (
        !params
            .destinatarioEmail
            .trim()
    ) {
        return;
    }

    if (
        !SMTP_USER
    ) {
        throw new Error(
            "SMTP_USER no está configurado."
        );
    }

    const etapaLabel =
        obtenerNombreEtapa(
            params.etapa
        );

    const titulo =
        params.tituloBitacora?.trim() ||
        `Bitácora #${params.bitacoraId}`;

    const link =
        obtenerLinkBitacora(
            params.bitacoraId
        );

    await transporter.sendMail({
        from: {
            name:
                "CRM RIDS",

            address:
                SMTP_USER,
        },

        to:
            params.destinatarioEmail,

        subject:
            `Solicitud de revisión · ${titulo} · ${etapaLabel}`,

        html: `
            <div
                style="
                    margin:0;
                    padding:24px;
                    background:#f8fafc;
                    font-family:Arial,Helvetica,sans-serif;
                    color:#0f172a;
                "
            >
                <div
                    style="
                        max-width:640px;
                        margin:0 auto;
                        background:#ffffff;
                        border:1px solid #e2e8f0;
                        border-radius:16px;
                        overflow:hidden;
                    "
                >
                    <div
                        style="
                            padding:22px 24px;
                            background:#ecfeff;
                            border-bottom:1px solid #cffafe;
                        "
                    >
                        <h2
                            style="
                                margin:0;
                                font-size:20px;
                                color:#155e75;
                            "
                        >
                            Solicitud de revisión de bitácora
                        </h2>
                    </div>

                    <div
                        style="
                            padding:24px;
                            line-height:1.6;
                        "
                    >
                        <p>
    Hola <strong>${escaparHtml(
            params.destinatarioNombre
        )}</strong>,
</p>

                        <p>
                            <strong>
                                ${escaparHtml(
            params.solicitadoPorNombre
        )}
                            </strong>
                            solicitó tu revisión de una etapa de bitácora.
                        </p>

                        <div
                            style="
                                margin:20px 0;
                                padding:16px;
                                background:#f8fafc;
                                border:1px solid #e2e8f0;
                                border-radius:12px;
                            "
                        >
                            <p style="margin:0 0 8px;">
                                <strong>Bitácora:</strong>
                                ${escaparHtml(
            titulo
        )}
                            </p>

                            <p style="margin:0;">
                                <strong>Etapa:</strong>
                                ${escaparHtml(
            etapaLabel
        )}
                            </p>
                        </div>

                        ${params.comentarioSolicitud
                ? `
                                    <div
                                        style="
                                            margin:20px 0;
                                            padding:16px;
                                            border-left:4px solid #0891b2;
                                            background:#ecfeff;
                                        "
                                    >
                                        <strong>Comentario:</strong>

                                        <div style="margin-top:6px;">
                                            ${escaparHtml(
                    params.comentarioSolicitud
                )}
                                        </div>
                                    </div>
                                `
                : ""
            }

                        ${link
                ? `
                                    <p style="margin-top:24px;">
                                        <a
                                            href="${escaparHtml(
                    link
                )}"
                                            style="
                                                display:inline-block;
                                                padding:11px 18px;
                                                background:#0891b2;
                                                color:#ffffff;
                                                text-decoration:none;
                                                border-radius:8px;
                                                font-weight:600;
                                            "
                                        >
                                            Revisar en CRM
                                        </a>
                                    </p>
                                `
                : `
                                    <p>
                                        Ingresa al CRM para revisar la solicitud.
                                    </p>
                                `
            }
                    </div>
                </div>
            </div>
        `,
    });
}

/* =====================================================
   RESULTADO DE REVISIÓN
===================================================== */

export async function enviarCorreoResultadoRevisionBitacora(
    params:
        ResultadoRevisionParams
) {
    if (
        !params
            .destinatarioEmail
            .trim()
    ) {
        return;
    }

    if (
        !SMTP_USER
    ) {
        throw new Error(
            "SMTP_USER no está configurado."
        );
    }

    const etapaLabel =
        obtenerNombreEtapa(
            params.etapa
        );

    const titulo =
        params.tituloBitacora?.trim() ||
        `Bitácora #${params.bitacoraId}`;

    const resultado =
        params.aprobada
            ? "aprobada"
            : "rechazada";

    const link =
        obtenerLinkBitacora(
            params.bitacoraId
        );

    await transporter.sendMail({
        from: {
            name:
                "CRM RIDS",

            address:
                SMTP_USER,
        },

        to:
            params.destinatarioEmail,

        subject:
            `Revisión ${resultado} · ${titulo} · ${etapaLabel}`,

        html: `
            <div
                style="
                    margin:0;
                    padding:24px;
                    background:#f8fafc;
                    font-family:Arial,Helvetica,sans-serif;
                    color:#0f172a;
                "
            >
                <div
                    style="
                        max-width:640px;
                        margin:0 auto;
                        background:#ffffff;
                        border:1px solid #e2e8f0;
                        border-radius:16px;
                        overflow:hidden;
                    "
                >
                    <div
                        style="
                            padding:22px 24px;
                            background:${params.aprobada
                ? "#ecfdf5"
                : "#fef2f2"
            };
                            border-bottom:1px solid ${params.aprobada
                ? "#a7f3d0"
                : "#fecaca"
            };
                        "
                    >
                        <h2
                            style="
                                margin:0;
                                font-size:20px;
                                color:${params.aprobada
                ? "#047857"
                : "#b91c1c"
            };
                            "
                        >
                            Revisión ${resultado}
                        </h2>
                    </div>

                    <div
                        style="
                            padding:24px;
                            line-height:1.6;
                        "
                    >
                        <p>
                            Hola
                            <strong>
                                ${escaparHtml(
                params.destinatarioNombre
            )}
                            </strong>,
                        </p>

                        <p>
    <strong>
        ${escaparHtml(
                params.revisorNombre
            )}
    </strong>
    ${params.aprobada
                ? "aprobó"
                : "rechazó"
            }
    la revisión solicitada.
</p>

                        <div
                            style="
                                margin:20px 0;
                                padding:16px;
                                background:#f8fafc;
                                border:1px solid #e2e8f0;
                                border-radius:12px;
                            "
                        >
                            <p style="margin:0 0 8px;">
                                <strong>Bitácora:</strong>
                                ${escaparHtml(
                titulo
            )}
                            </p>

                            <p style="margin:0;">
                                <strong>Etapa:</strong>
                                ${escaparHtml(
                etapaLabel
            )}
                            </p>
                        </div>

                        ${params.comentarioRespuesta
                ? `
                                    <div
                                        style="
                                            margin:20px 0;
                                            padding:16px;
                                            border-left:4px solid ${params.aprobada
                    ? "#10b981"
                    : "#ef4444"
                };
                                            background:${params.aprobada
                    ? "#ecfdf5"
                    : "#fef2f2"
                };
                                        "
                                    >
                                        <strong>
                                            Comentario del revisor:
                                        </strong>

                                        <div style="margin-top:6px;">
                                            ${escaparHtml(
                    params.comentarioRespuesta
                )}
                                        </div>
                                    </div>
                                `
                : ""
            }

                        ${link
                ? `
                                    <p style="margin-top:24px;">
                                        <a
                                            href="${escaparHtml(
                    link
                )}"
                                            style="
                                                display:inline-block;
                                                padding:11px 18px;
                                                background:#0891b2;
                                                color:#ffffff;
                                                text-decoration:none;
                                                border-radius:8px;
                                                font-weight:600;
                                            "
                                        >
                                            Ver bitácora
                                        </a>
                                    </p>
                                `
                : ""
            }
                    </div>
                </div>
            </div>
        `,
    });
}