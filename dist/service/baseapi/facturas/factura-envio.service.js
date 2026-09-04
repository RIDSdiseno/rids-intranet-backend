// src/service/baseapi/facturas/factura-envio.service.ts
import { prisma, } from "../../../lib/prisma.js";
import { generarDtePdfBuffer, } from "../baseapi-dte-pdf.service.js";
import { enviarCorreoFactura, construirAsuntoFactura, } from "./factura-email.service.js";
import { consultarDtePorFolioBaseApi, } from "../baseapi-dte.service.js";
/* =========================================================
   CONFIG
========================================================= */
const MINUTOS_PROCESANDO_TIMEOUT = 15;
const MAX_INTENTOS = 3;
/* =========================================================
   HELPERS
========================================================= */
function fechaDateToIso(value) {
    if (!value ||
        Number.isNaN(value.getTime())) {
        return null;
    }
    return [
        value
            .getUTCFullYear(),
        String(value.getUTCMonth() +
            1).padStart(2, "0"),
        String(value.getUTCDate()).padStart(2, "0"),
    ].join("-");
}
function fechaDateToPeriodo(value) {
    if (!value ||
        Number.isNaN(value.getTime())) {
        return null;
    }
    return [
        value
            .getUTCFullYear(),
        String(value.getUTCMonth() +
            1).padStart(2, "0"),
    ].join("-");
}
function normalizeRut(value) {
    return String(value ?? "")
        .replace(/[^0-9kK]/g, "")
        .toUpperCase()
        .trim();
}
function normalizeEmail(value) {
    return String(value ?? "")
        .trim()
        .toLowerCase();
}
/* =========================================================
   RECUPERAR PROCESANDO
========================================================= */
async function recuperarEnviosAtascados(empresa) {
    const ahora = new Date();
    const fechaLimite = new Date(ahora.getTime() -
        MINUTOS_PROCESANDO_TIMEOUT *
            60 *
            1000);
    const resultado = await prisma
        .rcvFacturaEnvio
        .updateMany({
        where: {
            ...(empresa
                ? {
                    empresaKey: empresa,
                }
                : {}),
            estado: "PROCESANDO",
            enviadoAt: null,
            procesandoAt: {
                lt: fechaLimite,
            },
        },
        data: {
            estado: "ERROR",
            procesandoAt: null,
            error: `Proceso abandonado: permaneció en PROCESANDO más de ${MINUTOS_PROCESANDO_TIMEOUT} minutos`,
        },
    });
    if (resultado.count >
        0) {
        console.warn("[FACTURA ENVÍO] ♻️ Registros recuperados", {
            total: resultado.count,
            empresa: empresa ??
                "todas",
        });
    }
    return resultado.count;
}
/* =========================================================
   CLAIM ATÓMICO
========================================================= */
async function intentarTomarEnvio(id) {
    const ahora = new Date();
    const resultado = await prisma
        .rcvFacturaEnvio
        .updateMany({
        where: {
            id,
            estado: {
                in: [
                    "PENDIENTE",
                    "ERROR",
                ],
            },
            enviadoAt: null,
            intentos: {
                lt: MAX_INTENTOS,
            },
        },
        data: {
            estado: "PROCESANDO",
            procesandoAt: ahora,
            ultimoIntentoAt: ahora,
            intentos: {
                increment: 1,
            },
            error: null,
        },
    });
    return (resultado.count ===
        1);
}
/* =========================================================
   VALIDAR DESTINATARIO ACTUAL
========================================================= */
async function validarDestinatarioActual(params) {
    const rut = normalizeRut(params
        .rutContraparte);
    if (!rut) {
        return {
            valido: false,
            motivo: "El receptor no tiene un RUT válido",
        };
    }
    const receptor = await prisma
        .receptorFacturacion
        .findUnique({
        where: {
            rut,
        },
        include: {
            contactos: {
                where: {
                    activo: true,
                    recibeFacturas: true,
                },
            },
        },
    });
    if (!receptor) {
        return {
            valido: false,
            motivo: "El receptor de facturación no está configurado",
        };
    }
    if (!receptor.activo) {
        return {
            valido: false,
            motivo: "El receptor de facturación está inactivo",
        };
    }
    if (!receptor.recibeFacturas) {
        return {
            valido: false,
            motivo: "El receptor no está autorizado para recibir facturas",
        };
    }
    const emailBuscado = normalizeEmail(params
        .emailDestino);
    const contactoValido = receptor
        .contactos
        .some((contacto) => normalizeEmail(contacto.email) ===
        emailBuscado);
    if (!contactoValido) {
        return {
            valido: false,
            motivo: "El contacto ya no está habilitado para recibir facturas",
        };
    }
    return {
        valido: true,
    };
}
/* =========================================================
   VALIDACIÓN FINAL DTE
========================================================= */
function normalizarRutDte(value) {
    return String(value ?? "")
        .replace(/[^0-9kK]/g, "")
        .toUpperCase();
}
function normalizarEstadoDte(value) {
    return String(value ?? "")
        .trim()
        .toUpperCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "");
}
/*
 * No hacemos una whitelist de estados "buenos"
 * porque BaseAPI/SII puede devolver estado vacío
 * o distintas nomenclaturas dependiendo del DTE.
 *
 * Sí bloqueamos estados explícitamente negativos.
 */
function estadoDteEsBloqueante(estado) {
    const valor = normalizarEstadoDte(estado);
    if (!valor) {
        return false;
    }
    const palabrasBloqueantes = [
        "ANULADO",
        "ANULADA",
        "RECHAZADO",
        "RECHAZADA",
        "INVALIDO",
        "INVALIDA",
        "CANCELADO",
        "CANCELADA",
    ];
    return palabrasBloqueantes.some((palabra) => valor.includes(palabra));
}
async function validarDteAntesDeEnviar(params) {
    const { empresa, periodo, tipoDoc, folio, rutContraparte, } = params;
    /*
     * IMPORTANTE:
     *
     * forceRefresh=true.
     *
     * No confiamos solamente en el DTE cacheado cuando
     * estamos a segundos de enviar un correo real.
     */
    const resultado = await consultarDtePorFolioBaseApi({
        empresa,
        periodo,
        folio,
        tipoDTE: tipoDoc,
        forceRefresh: true,
    });
    const documento = resultado
        .data
        ?.data
        ?.documento;
    if (!documento) {
        throw new Error(`No fue posible validar DTE ${tipoDoc}-${folio}: BaseAPI no retornó documento.`);
    }
    const tipoReal = String(documento
        .tipo_dte ??
        "");
    const folioReal = String(documento
        .folio ??
        "");
    const rutReal = normalizarRutDte(documento
        .rut_receptor);
    const rutEsperado = normalizarRutDte(rutContraparte);
    /*
     * 1. Tipo DTE
     */
    if (tipoReal !==
        String(tipoDoc)) {
        throw new Error(`DTE inconsistente: se esperaba tipo ${tipoDoc} y BaseAPI devolvió ${tipoReal || "sin tipo"}.`);
    }
    /*
     * 2. Folio
     */
    if (folioReal !==
        String(folio)) {
        throw new Error(`DTE inconsistente: se esperaba folio ${folio} y BaseAPI devolvió ${folioReal || "sin folio"}.`);
    }
    /*
     * 3. Receptor
     */
    if (!rutReal ||
        rutReal !==
            rutEsperado) {
        throw new Error(`DTE inconsistente: el RUT receptor no coincide con la factura preparada.`);
    }
    /*
     * 4. Debe existir XML.
     */
    if (!documento
        .xml_base64) {
        throw new Error(`DTE ${tipoDoc}-${folio} no posee XML válido para envío.`);
    }
    /*
     * 5. Estado explícitamente inválido.
     */
    if (estadoDteEsBloqueante(documento
        .estado)) {
        return {
            valido: false,
            estado: String(documento
                .estado ??
                ""),
            motivo: `El DTE tiene estado bloqueante: ${String(documento
                .estado)}.`,
        };
    }
    return {
        valido: true,
        estado: String(documento
            .estado ??
            ""),
        motivo: null,
    };
}
/* =========================================================
   PROCESAR
========================================================= */
export async function procesarEnviosFactura(options) {
    const limite = Math.max(1, Math.min(Number(options
        ?.limite ??
        20), 100));
    const recuperados = await recuperarEnviosAtascados(options
        ?.empresa);
    const pendientes = await prisma
        .rcvFacturaEnvio
        .findMany({
        where: {
            ...(options
                ?.empresa
                ? {
                    empresaKey: options
                        .empresa,
                }
                : {}),
            enviadoAt: null,
            intentos: {
                lt: MAX_INTENTOS,
            },
            OR: [
                {
                    estado: "PENDIENTE",
                },
                {
                    estado: "ERROR",
                },
            ],
        },
        orderBy: [
            {
                createdAt: "asc",
            },
            {
                id: "asc",
            },
        ],
        take: limite,
    });
    console.log("[FACTURA ENVÍO] Pendientes encontrados", {
        total: pendientes.length,
        empresa: options
            ?.empresa ??
            "todas",
        limite,
    });
    let procesados = 0;
    let enviados = 0;
    let errores = 0;
    let omitidos = 0;
    let cancelados = 0;
    for (const envio of pendientes) {
        const tomado = await intentarTomarEnvio(envio.id);
        if (!tomado) {
            omitidos++;
            continue;
        }
        procesados++;
        try {
            /*
             * -----------------------------------------------
             * 1. Configuración actual
             * -----------------------------------------------
             */
            const config = await prisma
                .rcvFacturaEnvioConfig
                .findUnique({
                where: {
                    empresaKey: envio
                        .empresaKey,
                },
            });
            if (!config ||
                !config.activo) {
                await prisma
                    .rcvFacturaEnvio
                    .update({
                    where: {
                        id: envio.id,
                    },
                    data: {
                        estado: "CANCELADO",
                        procesandoAt: null,
                        error: "Automatización de envío de facturas desactivada",
                    },
                });
                cancelados++;
                continue;
            }
            /*
             * No exigimos envioAutomatico=true aquí.
             *
             * Este endpoint será manual durante las pruebas.
             * El scheduler sí deberá exigirlo.
             */
            /*
             * -----------------------------------------------
             * 2. Revalidar destinatario
             * -----------------------------------------------
             */
            const validacionDestinatario = await validarDestinatarioActual({
                rutContraparte: envio
                    .rutContraparte,
                emailDestino: envio
                    .emailDestino,
            });
            if (!validacionDestinatario
                .valido) {
                await prisma
                    .rcvFacturaEnvio
                    .update({
                    where: {
                        id: envio.id,
                    },
                    data: {
                        estado: "CANCELADO",
                        procesandoAt: null,
                        error: validacionDestinatario
                            .motivo ??
                            "Destinatario ya no autorizado",
                    },
                });
                cancelados++;
                continue;
            }
            /*
             * -----------------------------------------------
             * 3. Fecha / período
             * -----------------------------------------------
             */
            const fechaEmision = fechaDateToIso(envio
                .fechaEmision);
            const periodo = fechaDateToPeriodo(envio
                .fechaEmision);
            if (!fechaEmision ||
                !periodo) {
                throw new Error(`El envío ${envio.id} no tiene una fecha de emisión válida`);
            }
            /*
             * -----------------------------------------------
             * 4. Validación final DTE
             * -----------------------------------------------
             */
            console.log("[FACTURA ENVÍO] 🔎 Validando DTE antes del envío", {
                id: envio.id,
                empresa: envio.empresaKey,
                tipoDoc: envio.tipoDoc,
                folio: envio.folio,
                periodo,
            });
            const validacionDte = await validarDteAntesDeEnviar({
                empresa: envio.empresaKey,
                periodo,
                tipoDoc: envio.tipoDoc,
                folio: envio.folio,
                rutContraparte: envio.rutContraparte,
            });
            if (!validacionDte.valido) {
                await prisma
                    .rcvFacturaEnvio
                    .update({
                    where: {
                        id: envio.id,
                    },
                    data: {
                        estado: "CANCELADO",
                        procesandoAt: null,
                        error: validacionDte.motivo ??
                            "DTE no válido para envío",
                    },
                });
                cancelados++;
                console.warn("[FACTURA ENVÍO] 🚫 DTE cancelado antes del SMTP", {
                    id: envio.id,
                    empresa: envio.empresaKey,
                    tipoDoc: envio.tipoDoc,
                    folio: envio.folio,
                    estadoDte: validacionDte.estado,
                    motivo: validacionDte.motivo,
                });
                continue;
            }
            console.log("[FACTURA ENVÍO] ✅ DTE validado", {
                id: envio.id,
                empresa: envio.empresaKey,
                tipoDoc: envio.tipoDoc,
                folio: envio.folio,
                estadoDte: validacionDte.estado ||
                    "(sin estado explícito)",
            });
            /*
             * -----------------------------------------------
             * 5. PDF
             * -----------------------------------------------
             */
            let adjuntoPdf;
            if (config.adjuntarPdf) {
                console.log("[FACTURA ENVÍO] 📄 Generando PDF", {
                    id: envio.id,
                    empresa: envio.empresaKey,
                    tipoDoc: envio.tipoDoc,
                    folio: envio.folio,
                    periodo,
                });
                const pdf = await generarDtePdfBuffer({
                    empresa: envio.empresaKey,
                    periodo,
                    folio: envio.folio,
                    tipoDTE: envio.tipoDoc,
                    forceRefresh: false,
                });
                adjuntoPdf = {
                    filename: pdf.filename,
                    content: pdf.buffer,
                };
                console.log("[FACTURA ENVÍO] ✅ PDF preparado", {
                    id: envio.id,
                    folio: envio.folio,
                    filename: pdf.filename,
                    bytes: pdf.buffer.length,
                });
            }
            /*
             * -----------------------------------------------
             * 6. Email
             * -----------------------------------------------
             */
            const resultadoEnvio = await enviarCorreoFactura({
                empresaKey: envio
                    .empresaKey,
                emailDestino: envio
                    .emailDestino,
                nombreDestino: envio
                    .nombreDestino,
                razonSocial: envio
                    .razonSocial,
                tipoDoc: envio
                    .tipoDoc,
                folio: envio
                    .folio,
                montoTotal: envio
                    .montoTotal,
                fechaEmision,
                ...(adjuntoPdf
                    ? {
                        adjuntoPdf,
                    }
                    : {}),
            });
            if (!resultadoEnvio.ok) {
                await prisma
                    .rcvFacturaEnvio
                    .update({
                    where: {
                        id: envio.id,
                    },
                    data: {
                        estado: "ERROR",
                        procesandoAt: null,
                        error: resultadoEnvio
                            .error ??
                            "Error desconocido enviando factura",
                    },
                });
                errores++;
                continue;
            }
            /*
             * -----------------------------------------------
             * 7. ENVIADO
             * -----------------------------------------------
             */
            const asunto = construirAsuntoFactura({
                empresaKey: envio
                    .empresaKey,
                tipoDoc: envio
                    .tipoDoc,
                folio: envio
                    .folio,
            });
            await prisma
                .rcvFacturaEnvio
                .update({
                where: {
                    id: envio.id,
                },
                data: {
                    estado: "ENVIADO",
                    asunto,
                    enviadoAt: new Date(),
                    procesandoAt: null,
                    error: null,
                },
            });
            enviados++;
            console.log("[FACTURA ENVÍO] ✅ Factura enviada", {
                id: envio.id,
                empresa: envio
                    .empresaKey,
                folio: envio
                    .folio,
                destinatarioOriginal: envio
                    .emailDestino,
            });
        }
        catch (error) {
            const message = error instanceof Error
                ? error.message
                : String(error);
            errores++;
            console.error("[FACTURA ENVÍO] ❌ Error procesando", {
                id: envio.id,
                folio: envio
                    .folio,
                error: message,
            });
            try {
                await prisma
                    .rcvFacturaEnvio
                    .update({
                    where: {
                        id: envio.id,
                    },
                    data: {
                        estado: "ERROR",
                        procesandoAt: null,
                        error: message,
                    },
                });
            }
            catch (updateError) {
                console.error("[FACTURA ENVÍO] ❌ No fue posible liberar registro", {
                    id: envio.id,
                    error: updateError,
                });
            }
        }
    }
    console.log("[FACTURA ENVÍO] Resumen", {
        recuperados,
        encontrados: pendientes.length,
        procesados,
        enviados,
        errores,
        omitidos,
        cancelados,
    });
    return {
        recuperados,
        encontrados: pendientes.length,
        procesados,
        enviados,
        errores,
        omitidos,
        cancelados,
    };
}
//# sourceMappingURL=factura-envio.service.js.map