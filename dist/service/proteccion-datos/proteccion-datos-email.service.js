// src/service/proteccion.datos/proteccion-datos-email.service.ts
import { EstadoCampaniaProteccionDatos, EstadoConsentimientoDatos, TipoEventoConsentimientoDatos, Prisma } from "@prisma/client";
import { prisma, } from "../../lib/prisma.js";
import { sendEmail, } from "../correos-masivos/masivos-email-sender.service.js";
import { obtenerFirmaMailer, } from "../correos-masivos/correos-masivos.service.js";
import { generarTokenConsentimiento, hashTokenConsentimiento } from "./proteccion-datos-token.service.js";
/* =========================================================
   CONFIG
   ========================================================= */
function getPublicBaseUrl() {
    const value = process.env
        .PROTECCION_DATOS_PUBLIC_URL
        ?.trim();
    if (!value) {
        throw new Error("PROTECCION_DATOS_PUBLIC_URL no está configurado");
    }
    /*
     * Evitamos terminar con /
     *
     * https://rids.cl/.../
     *                     ↑
     */
    return value.replace(/\/+$/, "");
}
/* =========================================================
   HTML
   ========================================================= */
function escaparHtml(value) {
    return String(value ??
        "")
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");
}
function crearBotonConsentimiento(url) {
    const safeUrl = escaparHtml(url);
    return `
        <a
            href="${safeUrl}"
            target="_blank"
            rel="noopener noreferrer"
            style="
                display:inline-block;
                padding:12px 20px;
                margin:8px 0;
                background:#075985;
                color:#ffffff;
                text-decoration:none;
                border-radius:8px;
                font-weight:600;
                font-family:Arial,sans-serif;
            "
        >
            Revisar y responder
        </a>
    `.trim();
}
function reemplazarVariable(html, variable, value) {
    return html.split(variable).join(value);
}
/* =========================================================
   PERSONALIZAR CORREO
   ========================================================= */
function personalizarCorreo({ bodyHtml, nombre, email, empresaNombre, versionDocumento, publicUrl, }) {
    let result = bodyHtml;
    result =
        reemplazarVariable(result, "{{NOMBRE}}", escaparHtml(nombre));
    result =
        reemplazarVariable(result, "{{EMPRESA}}", escaparHtml(empresaNombre));
    result =
        reemplazarVariable(result, "{{EMAIL}}", escaparHtml(email));
    result =
        reemplazarVariable(result, "{{VERSION_DOCUMENTO}}", escaparHtml(versionDocumento));
    result =
        reemplazarVariable(result, "{{LINK_CONSENTIMIENTO}}", escaparHtml(publicUrl));
    return result;
}
const PROTECCION_DATOS_CONCURRENCIA = Math.max(1, Math.min(10, Number(process.env
    .PROTECCION_DATOS_CONCURRENCIA ||
    5)));
async function procesarDestinatarioCampania({ destinatario, campania, baseUrl, firmaHtml, }) {
    const startedAt = Date.now();
    console.log("[PROTECCION DATOS] 📤 Procesando destinatario", {
        consentimientoId: destinatario.id,
        email: destinatario.email,
    });
    const token = generarTokenConsentimiento();
    const tokenHash = hashTokenConsentimiento(token);
    /* =====================================================
       RESERVAR DESTINATARIO
       ===================================================== */
    const claimStartedAt = Date.now();
    const claimed = await prisma
        .consentimientoDatos
        .updateMany({
        where: {
            id: destinatario.id,
            campaniaId: campania.id,
            estado: {
                in: [
                    EstadoConsentimientoDatos.PENDIENTE,
                    EstadoConsentimientoDatos.ERROR_ENVIO,
                ],
            },
            tokenHash: null,
        },
        data: {
            tokenHash,
            tokenExpiresAt: null,
        },
    });
    console.log("[PROTECCION DATOS] ⏱ Token reservado", {
        consentimientoId: destinatario.id,
        email: destinatario.email,
        durationMs: Date.now() -
            claimStartedAt,
    });
    /*
     * Otro proceso ya reclamó este destinatario.
     */
    if (claimed.count ===
        0) {
        console.warn("[PROTECCION DATOS] ⚠️ Destinatario ya reclamado", {
            consentimientoId: destinatario.id,
            email: destinatario.email,
        });
        return {
            consentimientoId: destinatario.id,
            email: destinatario.email,
            ok: false,
            error: "El destinatario ya fue reclamado por otro proceso",
        };
    }
    const publicUrl = `${baseUrl}/${token}`;
    let bodyHtml = personalizarCorreo({
        bodyHtml: campania.cuerpoCorreoHtml,
        nombre: destinatario.nombre,
        email: destinatario.email,
        empresaNombre: destinatario.empresaNombre,
        versionDocumento: destinatario.versionDocumento,
        publicUrl,
    });
    if (firmaHtml) {
        bodyHtml =
            `
                ${bodyHtml}

                ${firmaHtml}
            `.trim();
    }
    try {
        /* =================================================
           SMTP
           ================================================= */
        const smtpStartedAt = Date.now();
        await sendEmail({
            to: destinatario.email,
            subject: campania.asuntoCorreo,
            bodyHtml,
            attachments: [],
        });
        console.log("[PROTECCION DATOS] ⏱ SMTP completado", {
            consentimientoId: destinatario.id,
            email: destinatario.email,
            durationMs: Date.now() -
                smtpStartedAt,
        });
        const ahora = new Date();
        /* =================================================
           BD POST ENVÍO
           ================================================= */
        const dbStartedAt = Date.now();
        await prisma.$transaction([
            prisma
                .consentimientoDatos
                .update({
                where: {
                    id: destinatario.id,
                },
                data: {
                    estado: EstadoConsentimientoDatos.ENVIADO,
                    fechaEnvio: ahora,
                },
            }),
            prisma
                .consentimientoDatosEvento
                .create({
                data: {
                    consentimientoId: destinatario.id,
                    tipo: TipoEventoConsentimientoDatos.ENVIADO,
                    detalle: {
                        email: destinatario.email,
                    },
                },
            }),
            prisma
                .campaniaProteccionDatos
                .updateMany({
                where: {
                    id: campania.id,
                    fechaEnvioInicial: null,
                },
                data: {
                    fechaEnvioInicial: ahora,
                },
            }),
        ]);
        console.log("[PROTECCION DATOS] ✅ Destinatario enviado", {
            consentimientoId: destinatario.id,
            email: destinatario.email,
            dbDurationMs: Date.now() -
                dbStartedAt,
            totalDurationMs: Date.now() -
                startedAt,
        });
        return {
            consentimientoId: destinatario.id,
            email: destinatario.email,
            ok: true,
        };
    }
    catch (error) {
        /* =================================================
           INVALIDAR TOKEN FALLIDO
           ================================================= */
        const dbErrorStartedAt = Date.now();
        await prisma.$transaction([
            prisma
                .consentimientoDatos
                .update({
                where: {
                    id: destinatario.id,
                },
                data: {
                    estado: EstadoConsentimientoDatos.ERROR_ENVIO,
                    tokenHash: null,
                    tokenExpiresAt: null,
                },
            }),
            prisma
                .consentimientoDatosEvento
                .create({
                data: {
                    consentimientoId: destinatario.id,
                    tipo: TipoEventoConsentimientoDatos.ERROR_ENVIO,
                    detalle: {
                        email: destinatario.email,
                        error: error instanceof Error
                            ? error.message
                            : "Error desconocido",
                    },
                },
            }),
        ]);
        console.error("[PROTECCION DATOS] ❌ Error destinatario", {
            consentimientoId: destinatario.id,
            email: destinatario.email,
            error: error instanceof Error
                ? error.message
                : error,
            dbDurationMs: Date.now() -
                dbErrorStartedAt,
            totalDurationMs: Date.now() -
                startedAt,
        });
        return {
            consentimientoId: destinatario.id,
            email: destinatario.email,
            ok: false,
            error: error instanceof Error
                ? error.message
                : "Error desconocido",
        };
    }
}
/* =========================================================
   ENVIAR CAMPAÑA
   ========================================================= */
export async function enviarCampaniaProteccionDatos(campaniaId) {
    if (!Number.isInteger(campaniaId) ||
        campaniaId <= 0) {
        throw new Error("ID de campaña inválido");
    }
    /* =====================================================
       CAMPAÑA
       ===================================================== */
    const campania = await prisma
        .campaniaProteccionDatos
        .findUnique({
        where: {
            id: campaniaId,
        },
        select: {
            id: true,
            estado: true,
            asuntoCorreo: true,
            cuerpoCorreoHtml: true,
            fechaEnvioInicial: true,
        },
    });
    if (!campania) {
        throw new Error("Campaña de protección de datos no encontrada");
    }
    if (campania.estado !==
        EstadoCampaniaProteccionDatos.ACTIVA) {
        throw new Error("Solo una campaña ACTIVA puede enviarse");
    }
    /* =====================================================
       DESTINATARIOS PENDIENTES / ERROR
       ===================================================== */
    const destinatarios = await prisma
        .consentimientoDatos
        .findMany({
        where: {
            campaniaId: campania.id,
            estado: {
                in: [
                    EstadoConsentimientoDatos.PENDIENTE,
                    EstadoConsentimientoDatos.ERROR_ENVIO,
                ],
            },
        },
        select: {
            id: true,
            nombre: true,
            email: true,
            empresaNombre: true,
            versionDocumento: true,
            estado: true,
            tokenHash: true,
        },
        orderBy: {
            id: "asc",
        },
    });
    if (destinatarios.length ===
        0) {
        throw new Error("La campaña no tiene destinatarios pendientes de envío");
    }
    /* =====================================================
       URL PÚBLICA
       ===================================================== */
    const baseUrl = getPublicBaseUrl();
    /* =====================================================
       FIRMA RIDS
       ===================================================== */
    const firma = await obtenerFirmaMailer();
    /* =====================================================
       RESULTADOS
       ===================================================== */
    const resultados = [];
    let enviados = 0;
    let errores = 0;
    /* =====================================================
       PROCESAR UNO POR UNO
       ===================================================== */
    for (const destinatario of destinatarios) {
        /*
         * El token anterior debe estar vacío
         * para reclamar este envío.
         *
         * Esto además ayuda a impedir que dos
         * requests concurrentes envíen el mismo
         * consentimiento dos veces.
         */
        const token = generarTokenConsentimiento();
        const tokenHash = hashTokenConsentimiento(token);
        /* =================================================
           RESERVAR TOKEN
           ================================================= */
        const claimed = await prisma
            .consentimientoDatos
            .updateMany({
            where: {
                id: destinatario.id,
                campaniaId: campania.id,
                estado: {
                    in: [
                        EstadoConsentimientoDatos.PENDIENTE,
                        EstadoConsentimientoDatos.ERROR_ENVIO,
                    ],
                },
                tokenHash: null,
            },
            data: {
                tokenHash,
                /*
                 * Por ahora sin expiración.
                 *
                 * Ya tienes soporte para
                 * tokenExpiresAt en el modelo.
                 */
                tokenExpiresAt: null,
            },
        });
        /*
         * Otro proceso pudo tomarlo antes.
         */
        if (claimed.count ===
            0) {
            continue;
        }
        const publicUrl = `${baseUrl}/${token}`;
        /* =================================================
           PERSONALIZAR HTML
           ================================================= */
        let bodyHtml = personalizarCorreo({
            bodyHtml: campania
                .cuerpoCorreoHtml,
            nombre: destinatario.nombre,
            email: destinatario.email,
            empresaNombre: destinatario
                .empresaNombre,
            versionDocumento: destinatario
                .versionDocumento,
            publicUrl,
        });
        /* =================================================
           FIRMA
           ================================================= */
        if (firma.html) {
            bodyHtml =
                `
                    ${bodyHtml}

                    ${firma.html}
                `.trim();
        }
        /* =================================================
           SMTP
           ================================================= */
        try {
            await sendEmail({
                to: destinatario.email,
                subject: campania.asuntoCorreo,
                bodyHtml,
                attachments: [],
            });
            const ahora = new Date();
            /* =================================================
               MARCAR ENVIADO + EVENTO
               ================================================= */
            await prisma.$transaction([
                prisma
                    .consentimientoDatos
                    .update({
                    where: {
                        id: destinatario.id,
                    },
                    data: {
                        estado: EstadoConsentimientoDatos.ENVIADO,
                        fechaEnvio: ahora,
                    },
                }),
                prisma
                    .consentimientoDatosEvento
                    .create({
                    data: {
                        consentimientoId: destinatario.id,
                        tipo: TipoEventoConsentimientoDatos.ENVIADO,
                        detalle: {
                            email: destinatario.email,
                        },
                    },
                }),
                /*
                 * Solo la primera vez.
                 */
                prisma
                    .campaniaProteccionDatos
                    .updateMany({
                    where: {
                        id: campania.id,
                        fechaEnvioInicial: null,
                    },
                    data: {
                        fechaEnvioInicial: ahora,
                    },
                }),
            ]);
            enviados +=
                1;
            resultados.push({
                consentimientoId: destinatario.id,
                email: destinatario.email,
                ok: true,
            });
        }
        catch (error) {
            /* =================================================
               INVALIDAR TOKEN FALLIDO
               ================================================= */
            await prisma.$transaction([
                prisma
                    .consentimientoDatos
                    .update({
                    where: {
                        id: destinatario.id,
                    },
                    data: {
                        estado: EstadoConsentimientoDatos.ERROR_ENVIO,
                        tokenHash: null,
                        tokenExpiresAt: null,
                    },
                }),
                prisma
                    .consentimientoDatosEvento
                    .create({
                    data: {
                        consentimientoId: destinatario.id,
                        tipo: TipoEventoConsentimientoDatos.ERROR_ENVIO,
                        detalle: {
                            email: destinatario.email,
                            error: error instanceof Error
                                ? error.message
                                : "Error desconocido",
                        },
                    },
                }),
            ]);
            errores +=
                1;
            resultados.push({
                consentimientoId: destinatario.id,
                email: destinatario.email,
                ok: false,
                error: error instanceof Error
                    ? error.message
                    : "Error desconocido",
            });
        }
    }
    return {
        campaniaId: campania.id,
        procesados: resultados.length,
        enviados,
        errores,
        resultados,
    };
}
//# sourceMappingURL=proteccion-datos-email.service.js.map