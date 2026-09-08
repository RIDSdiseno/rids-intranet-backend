// src/service/baseapi/cobranza/cobranza-envio.service.ts
import { prisma, } from "../../../lib/prisma.js";
import { enviarCorreoCobranza, construirAsuntoCobranza, } from "./cobranza-email.service.js";
import { generarDtePdfBuffer, } from "../baseapi-dte-pdf.service.js";
/* =========================================================
   CONFIGURACIÓN WORKER
========================================================= */
/*
 * Un registro PROCESANDO durante más de este tiempo
 * se considera abandonado.
 *
 * Puede ocurrir por:
 *
 * - reinicio de Railway
 * - cierre inesperado del proceso
 * - excepción no controlada
 * - caída de conexión
 */
const MINUTOS_PROCESANDO_TIMEOUT = 15;
const MAX_INTENTOS = 3;
/* =========================================================
   HELPERS
========================================================= */
function fechaDateToIso(value) {
    if (!value) {
        return null;
    }
    if (Number.isNaN(value.getTime())) {
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
async function resolverPeriodoDte(empresaKey, tipoDoc, folio, fechaVencimiento) {
    const tipoDTE = Number(tipoDoc);
    const folioInt = Number(folio);
    if (Number.isFinite(tipoDTE) &&
        Number.isFinite(folioInt)) {
        const factura = await prisma.facturaDTE.findFirst({
            where: {
                empresaAlias: empresaKey,
                tipoDTE,
                folio: folioInt,
            },
            select: {
                fechaEmision: true,
            },
        });
        const periodoFactura = fechaDateToPeriodo(factura
            ?.fechaEmision ??
            null);
        if (periodoFactura) {
            return periodoFactura;
        }
    }
    /*
     * Fallback.
     *
     * Normalmente no se utilizará porque los DTE
     * de cobranza ya están cacheados.
     */
    const periodoVencimiento = fechaDateToPeriodo(fechaVencimiento);
    if (periodoVencimiento) {
        console.warn("[COBRANZA ENVÍO] ⚠️ Período DTE inferido desde vencimiento", {
            empresa: empresaKey,
            tipoDoc,
            folio,
            periodo: periodoVencimiento,
        });
        return periodoVencimiento;
    }
    throw new Error(`No fue posible determinar el período del DTE ${tipoDoc}-${folio}`);
}
/* =========================================================
   RECUPERAR REGISTROS ATASCADOS
========================================================= */
async function recuperarRecordatoriosAtascados(empresa, limite = 100) {
    const ahora = new Date();
    const fechaLimite = new Date(ahora.getTime() -
        MINUTOS_PROCESANDO_TIMEOUT *
            60 *
            1000);
    const candidatos = await prisma.rcvRecordatorioEnvio.findMany({
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
        select: {
            id: true,
        },
        orderBy: [
            {
                procesandoAt: "asc",
            },
            {
                id: "asc",
            },
        ],
        take: Math.max(1, Math.min(limite, 100)),
    });
    const idsRecuperados = [];
    for (const candidato of candidatos) {
        const resultado = await prisma.rcvRecordatorioEnvio.updateMany({
            where: {
                id: candidato.id,
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
        if (resultado.count ===
            1) {
            idsRecuperados.push(candidato.id);
        }
    }
    if (idsRecuperados.length >
        0) {
        console.warn("[COBRANZA ENVÍO] ♻️ Recordatorios recuperados", {
            total: idsRecuperados.length,
            ids: idsRecuperados,
            empresa: empresa ??
                "todas",
        });
    }
    return idsRecuperados;
}
/* =========================================================
   CLAIM ATÓMICO
========================================================= */
async function intentarTomarRecordatorio(id) {
    /*
     * El updateMany funciona como un lock lógico.
     *
     * Solo un worker puede pasar:
     *
     * PENDIENTE / ERROR
     *        ↓
     * PROCESANDO
     */
    const ahora = new Date();
    const resultado = await prisma.rcvRecordatorioEnvio.updateMany({
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
   PROCESAR ENVÍOS
========================================================= */
export async function procesarEnviosCobranza(options) {
    const limite = Math.max(1, Math.min(Number(options?.limite ??
        20), 100));
    const debeRecuperarAtascados = options?.recuperarAtascados !== false;
    const idsRecuperados = debeRecuperarAtascados ? await recuperarRecordatoriosAtascados(options?.empresa, limite) : [];
    const recuperados = idsRecuperados.length;
    /*
     * En la primera fase procesaremos:
     *
     * PENDIENTE
     * ERROR con menos de 3 intentos
     */
    const pendientes = await prisma.rcvRecordatorioEnvio.findMany({
        where: {
            ...(options
                ?.empresa
                ? {
                    empresaKey: options
                        .empresa,
                }
                : {}),
            ...(options?.ids?.length
                ? {
                    id: {
                        in: options.ids,
                    },
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
        orderBy: {
            createdAt: "asc",
        },
        take: limite,
    });
    console.log("[COBRANZA ENVÍO] Pendientes encontrados", {
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
    for (const recordatorio of pendientes) {
        /*
         * -----------------------------------------------
         * 1. CLAIM
         * -----------------------------------------------
         */
        const tomado = await intentarTomarRecordatorio(recordatorio.id);
        if (!tomado) {
            omitidos++;
            continue;
        }
        procesados++;
        try {
            /*
             * -----------------------------------------------
             * 2. Seguridad:
             * comprobar configuración de empresa
             * -----------------------------------------------
             */
            const config = await prisma.rcvCobranzaConfig.findUnique({
                where: {
                    empresaKey: recordatorio
                        .empresaKey,
                },
            });
            if (!config ||
                !config.activo) {
                await prisma.rcvRecordatorioEnvio.update({
                    where: {
                        id: recordatorio.id,
                    },
                    data: {
                        estado: "CANCELADO",
                        procesandoAt: null,
                        error: "Automatización de cobranza desactivada",
                    },
                });
                errores++;
                continue;
            }
            /*
             * IMPORTANTE:
             *
             * Todavía NO exigimos envioAutomatico=true
             * porque este worker será inicialmente
             * ejecutado mediante endpoint manual.
             *
             * El scheduler sí lo comprobará posteriormente.
             */
            const fechaVencimiento = fechaDateToIso(recordatorio
                .fechaVencimiento);
            if (!fechaVencimiento) {
                await prisma.rcvRecordatorioEnvio.update({
                    where: {
                        id: recordatorio.id,
                    },
                    data: {
                        estado: "ERROR",
                        procesandoAt: null,
                        error: "Recordatorio sin fecha de vencimiento válida",
                    },
                });
                errores++;
                continue;
            }
            /*
  * -----------------------------------------------
  * 3. Preparar PDF DTE
  * -----------------------------------------------
  */
            let adjuntoPdf;
            if (config.adjuntarPdf) {
                const empresaKey = recordatorio
                    .empresaKey;
                const periodoDte = await resolverPeriodoDte(empresaKey, recordatorio
                    .tipoDoc, recordatorio
                    .folio, recordatorio
                    .fechaVencimiento);
                console.log("[COBRANZA ENVÍO] 📄 Generando PDF", {
                    id: recordatorio.id,
                    empresa: empresaKey,
                    tipoDoc: recordatorio
                        .tipoDoc,
                    folio: recordatorio
                        .folio,
                    periodo: periodoDte,
                });
                const pdf = await generarDtePdfBuffer({
                    empresa: empresaKey,
                    periodo: periodoDte,
                    folio: recordatorio
                        .folio,
                    tipoDTE: recordatorio
                        .tipoDoc,
                    forceRefresh: false,
                });
                adjuntoPdf = {
                    filename: pdf.filename,
                    content: pdf.buffer,
                };
                console.log("[COBRANZA ENVÍO] ✅ PDF preparado", {
                    id: recordatorio.id,
                    folio: recordatorio
                        .folio,
                    filename: pdf.filename,
                    bytes: pdf.buffer
                        .length,
                });
            }
            const resultadoEnvio = await enviarCorreoCobranza({
                empresaKey: recordatorio
                    .empresaKey,
                emailDestino: recordatorio
                    .emailDestino,
                nombreDestino: recordatorio
                    .nombreDestino,
                razonSocial: recordatorio
                    .razonSocial,
                tipoDoc: recordatorio
                    .tipoDoc,
                folio: recordatorio
                    .folio,
                montoTotal: recordatorio
                    .montoTotal,
                fechaVencimiento,
                diasDiferencia: recordatorio
                    .diasDiferencia ??
                    0,
                tipoRecordatorio: recordatorio
                    .tipoRecordatorio,
                ...(adjuntoPdf
                    ? {
                        adjuntoPdf,
                    }
                    : {}),
            });
            /*
             * -----------------------------------------------
             * 4A. ERROR
             * -----------------------------------------------
             */
            if (!resultadoEnvio.ok) {
                await prisma.rcvRecordatorioEnvio.update({
                    where: {
                        id: recordatorio.id,
                    },
                    data: {
                        estado: "ERROR",
                        procesandoAt: null,
                        error: resultadoEnvio
                            .error ??
                            "Error desconocido enviando correo",
                    },
                });
                errores++;
                continue;
            }
            /*
             * -----------------------------------------------
             * 4B. ENVIADO
             * -----------------------------------------------
             */
            const asunto = construirAsuntoCobranza({
                empresaKey: recordatorio
                    .empresaKey,
                folio: recordatorio
                    .folio,
                tipoRecordatorio: recordatorio
                    .tipoRecordatorio,
            });
            await prisma.rcvRecordatorioEnvio.update({
                where: {
                    id: recordatorio.id,
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
            console.log("[COBRANZA ENVÍO] ✅ Recordatorio completado", {
                id: recordatorio.id,
                empresa: recordatorio
                    .empresaKey,
                folio: recordatorio
                    .folio,
                email: recordatorio
                    .emailDestino,
            });
        }
        catch (error) {
            const message = error instanceof Error
                ? error.message
                : String(error);
            errores++;
            console.error("[COBRANZA ENVÍO] ❌ Error procesando recordatorio", {
                id: recordatorio.id,
                error: message,
            });
            /*
             * Intentamos liberar el registro.
             */
            try {
                await prisma.rcvRecordatorioEnvio.update({
                    where: {
                        id: recordatorio.id,
                    },
                    data: {
                        estado: "ERROR",
                        procesandoAt: null,
                        error: message,
                    },
                });
            }
            catch (updateError) {
                console.error("[COBRANZA ENVÍO] ❌ No fue posible actualizar estado ERROR", {
                    id: recordatorio.id,
                    error: updateError,
                });
            }
        }
    }
    console.log("[COBRANZA ENVÍO] Resumen", {
        recuperados,
        encontrados: pendientes.length,
        procesados,
        enviados,
        errores,
        omitidos,
    });
    return {
        recuperados,
        procesados,
        enviados,
        errores,
        omitidos,
    };
}
export async function procesarRecoveryEnviosCobranza(options) {
    const limite = Math.max(1, Math.min(Number(options
        ?.limite ??
        100), 100));
    const idsRecuperados = await recuperarRecordatoriosAtascados(options
        ?.empresa, limite);
    if (idsRecuperados.length ===
        0) {
        console.log("[COBRANZA RECOVERY] ✅ Sin recordatorios atascados", {
            empresa: options
                ?.empresa ??
                "todas",
        });
        return {
            recuperados: 0,
            procesados: 0,
            enviados: 0,
            errores: 0,
            omitidos: 0,
        };
    }
    console.log("[COBRANZA RECOVERY] 🔁 Reintentando recordatorios recuperados", {
        empresa: options
            ?.empresa ??
            "todas",
        total: idsRecuperados.length,
        ids: idsRecuperados,
    });
    const resultado = await procesarEnviosCobranza({
        ...(options?.empresa
            ? {
                empresa: options.empresa,
            }
            : {}),
        ids: idsRecuperados,
        limite: idsRecuperados.length,
        recuperarAtascados: false,
    });
    return {
        ...resultado,
        recuperados: idsRecuperados.length,
    };
}
//# sourceMappingURL=cobranza-envio.service.js.map