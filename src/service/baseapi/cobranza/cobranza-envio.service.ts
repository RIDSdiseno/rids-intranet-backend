// src/service/baseapi/cobranza/cobranza-envio.service.ts

import {
    prisma,
} from "../../../lib/prisma.js";

import {
    enviarCorreoCobranza,
    construirAsuntoCobranza,
} from "./cobranza-email.service.js";

import type {
    EmpresaKey,
} from "./cobranza-estado.service.js";

import {
    generarDtePdfBuffer,
} from "../baseapi-dte-pdf.service.js";

/* =========================================================
   TYPES
========================================================= */

type ProcesarEnviosOptions = {
    empresa?:
    EmpresaKey;

    limite?:
    number;
};

export type ResultadoProcesarEnvios = {
    recuperados:
    number;

    procesados:
    number;

    enviados:
    number;

    errores:
    number;

    omitidos:
    number;
};

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
const MINUTOS_PROCESANDO_TIMEOUT =
    15;

/* =========================================================
   HELPERS
========================================================= */

function fechaDateToIso(
    value:
        Date | null
): string | null {
    if (
        !value
    ) {
        return null;
    }

    if (
        Number.isNaN(
            value.getTime()
        )
    ) {
        return null;
    }

    return [
        value
            .getUTCFullYear(),

        String(
            value.getUTCMonth() +
            1
        ).padStart(
            2,
            "0"
        ),

        String(
            value.getUTCDate()
        ).padStart(
            2,
            "0"
        ),
    ].join("-");
}

function fechaDateToPeriodo(
    value:
        Date | null
): string | null {
    if (
        !value ||
        Number.isNaN(
            value.getTime()
        )
    ) {
        return null;
    }

    return [
        value
            .getUTCFullYear(),

        String(
            value.getUTCMonth() +
            1
        ).padStart(
            2,
            "0"
        ),
    ].join("-");
}

async function resolverPeriodoDte(
    empresaKey:
        EmpresaKey,

    tipoDoc:
        string,

    folio:
        string,

    fechaVencimiento:
        Date | null
): Promise<string> {
    const tipoDTE =
        Number(
            tipoDoc
        );

    const folioInt =
        Number(
            folio
        );

    if (
        Number.isFinite(
            tipoDTE
        ) &&
        Number.isFinite(
            folioInt
        )
    ) {
        const factura =
            await prisma.facturaDTE.findFirst({
                where: {
                    empresaAlias:
                        empresaKey,

                    tipoDTE,

                    folio:
                        folioInt,
                },

                select: {
                    fechaEmision:
                        true,
                },
            });

        const periodoFactura =
            fechaDateToPeriodo(
                factura
                    ?.fechaEmision ??
                null
            );

        if (
            periodoFactura
        ) {
            return periodoFactura;
        }
    }

    /*
     * Fallback.
     *
     * Normalmente no se utilizará porque los DTE
     * de cobranza ya están cacheados.
     */
    const periodoVencimiento =
        fechaDateToPeriodo(
            fechaVencimiento
        );

    if (
        periodoVencimiento
    ) {
        console.warn(
            "[COBRANZA ENVÍO] ⚠️ Período DTE inferido desde vencimiento",
            {
                empresa:
                    empresaKey,

                tipoDoc,

                folio,

                periodo:
                    periodoVencimiento,
            }
        );

        return periodoVencimiento;
    }

    throw new Error(
        `No fue posible determinar el período del DTE ${tipoDoc}-${folio}`
    );
}

/* =========================================================
   RECUPERAR REGISTROS ATASCADOS
========================================================= */

async function recuperarRecordatoriosAtascados(
    empresa?:
        EmpresaKey
): Promise<number> {
    const ahora =
        new Date();

    const fechaLimite =
        new Date(
            ahora.getTime() -
            MINUTOS_PROCESANDO_TIMEOUT *
            60 *
            1000
        );

    /*
     * Un registro se recupera solamente si:
     *
     * - sigue en PROCESANDO
     * - todavía NO fue enviado
     * - procesandoAt es anterior al timeout
     *
     * No modificamos "intentos":
     *
     * el intento ya fue incrementado cuando
     * el worker realizó el claim originalmente.
     */
    const resultado =
        await prisma.rcvRecordatorioEnvio.updateMany({
            where: {
                ...(empresa
                    ? {
                        empresaKey:
                            empresa,
                    }
                    : {}),

                estado:
                    "PROCESANDO",

                enviadoAt:
                    null,

                procesandoAt: {
                    lt:
                        fechaLimite,
                },
            },

            data: {
                estado:
                    "ERROR",

                procesandoAt:
                    null,

                error:
                    `Proceso abandonado: permaneció en PROCESANDO más de ${MINUTOS_PROCESANDO_TIMEOUT} minutos`,
            },
        });

    if (
        resultado.count >
        0
    ) {
        console.warn(
            "[COBRANZA ENVÍO] ♻️ Recordatorios PROCESANDO recuperados",
            {
                total:
                    resultado.count,

                empresa:
                    empresa ??
                    "todas",

                timeoutMinutos:
                    MINUTOS_PROCESANDO_TIMEOUT,

                fechaLimite:
                    fechaLimite
                        .toISOString(),
            }
        );
    }

    return resultado.count;
}

/* =========================================================
   CLAIM ATÓMICO
========================================================= */

async function intentarTomarRecordatorio(
    id: number
) {
    /*
     * El updateMany funciona como un lock lógico.
     *
     * Solo un worker puede pasar:
     *
     * PENDIENTE / ERROR
     *        ↓
     * PROCESANDO
     */

    const ahora =
        new Date();

    const resultado =
        await prisma.rcvRecordatorioEnvio.updateMany({
            where: {
                id,

                estado: {
                    in: [
                        "PENDIENTE",
                        "ERROR",
                    ],
                },

                enviadoAt:
                    null,
            },

            data: {
                estado:
                    "PROCESANDO",

                procesandoAt:
                    ahora,

                ultimoIntentoAt:
                    ahora,

                intentos: {
                    increment:
                        1,
                },

                error:
                    null,
            },
        });

    return (
        resultado.count ===
        1
    );
}

/* =========================================================
   PROCESAR ENVÍOS
========================================================= */

export async function procesarEnviosCobranza(
    options?:
        ProcesarEnviosOptions
): Promise<
    ResultadoProcesarEnvios
> {
    const limite =
        Math.max(
            1,
            Math.min(
                Number(
                    options?.limite ??
                    20
                ),
                100
            )
        );

    /*
 * Antes de buscar nuevos trabajos recuperamos
 * los que hayan quedado bloqueados por una
 * ejecución anterior.
 */
    const recuperados =
        await recuperarRecordatoriosAtascados(
            options?.empresa
        );

    /*
     * En la primera fase procesaremos:
     *
     * PENDIENTE
     * ERROR con menos de 3 intentos
     */

    const pendientes =
        await prisma.rcvRecordatorioEnvio.findMany({
            where: {
                ...(options
                    ?.empresa
                    ? {
                        empresaKey:
                            options
                                .empresa,
                    }
                    : {}),

                enviadoAt:
                    null,

                OR: [
                    {
                        estado:
                            "PENDIENTE",
                    },

                    {
                        estado:
                            "ERROR",

                        intentos: {
                            lt:
                                3,
                        },
                    },
                ],
            },

            orderBy: {
                createdAt:
                    "asc",
            },

            take:
                limite,
        });

    console.log(
        "[COBRANZA ENVÍO] Pendientes encontrados",
        {
            total:
                pendientes.length,

            empresa:
                options
                    ?.empresa ??
                "todas",

            limite,
        }
    );

    let procesados =
        0;

    let enviados =
        0;

    let errores =
        0;

    let omitidos =
        0;

    for (
        const recordatorio
        of pendientes
    ) {
        /*
         * -----------------------------------------------
         * 1. CLAIM
         * -----------------------------------------------
         */

        const tomado =
            await intentarTomarRecordatorio(
                recordatorio.id
            );

        if (
            !tomado
        ) {
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

            const config =
                await prisma.rcvCobranzaConfig.findUnique({
                    where: {
                        empresaKey:
                            recordatorio
                                .empresaKey,
                    },
                });

            if (
                !config ||
                !config.activo
            ) {
                await prisma.rcvRecordatorioEnvio.update({
                    where: {
                        id:
                            recordatorio.id,
                    },

                    data: {
                        estado:
                            "ERROR",

                        procesandoAt:
                            null,

                        error:
                            "Automatización de cobranza desactivada",
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

            const fechaVencimiento =
                fechaDateToIso(
                    recordatorio
                        .fechaVencimiento
                );

            if (
                !fechaVencimiento
            ) {
                await prisma.rcvRecordatorioEnvio.update({
                    where: {
                        id:
                            recordatorio.id,
                    },

                    data: {
                        estado:
                            "ERROR",

                        procesandoAt:
                            null,

                        error:
                            "Recordatorio sin fecha de vencimiento válida",
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

            let adjuntoPdf:
                {
                    filename:
                    string;

                    content:
                    Buffer;
                }
                | undefined;

            if (
                config.adjuntarPdf
            ) {
                const empresaKey =
                    recordatorio
                        .empresaKey as
                    EmpresaKey;

                const periodoDte =
                    await resolverPeriodoDte(
                        empresaKey,

                        recordatorio
                            .tipoDoc,

                        recordatorio
                            .folio,

                        recordatorio
                            .fechaVencimiento
                    );

                console.log(
                    "[COBRANZA ENVÍO] 📄 Generando PDF",
                    {
                        id:
                            recordatorio.id,

                        empresa:
                            empresaKey,

                        tipoDoc:
                            recordatorio
                                .tipoDoc,

                        folio:
                            recordatorio
                                .folio,

                        periodo:
                            periodoDte,
                    }
                );

                const pdf =
                    await generarDtePdfBuffer({
                        empresa:
                            empresaKey,

                        periodo:
                            periodoDte,

                        folio:
                            recordatorio
                                .folio,

                        tipoDTE:
                            recordatorio
                                .tipoDoc,

                        forceRefresh:
                            false,
                    });

                adjuntoPdf = {
                    filename:
                        pdf.filename,

                    content:
                        pdf.buffer,
                };

                console.log(
                    "[COBRANZA ENVÍO] ✅ PDF preparado",
                    {
                        id:
                            recordatorio.id,

                        folio:
                            recordatorio
                                .folio,

                        filename:
                            pdf.filename,

                        bytes:
                            pdf.buffer
                                .length,
                    }
                );
            }

            const resultadoEnvio =
                await enviarCorreoCobranza({
                    empresaKey:
                        recordatorio
                            .empresaKey as
                        EmpresaKey,

                    emailDestino:
                        recordatorio
                            .emailDestino,

                    nombreDestino:
                        recordatorio
                            .nombreDestino,

                    razonSocial:
                        recordatorio
                            .razonSocial,

                    tipoDoc:
                        recordatorio
                            .tipoDoc,

                    folio:
                        recordatorio
                            .folio,

                    montoTotal:
                        recordatorio
                            .montoTotal,

                    fechaVencimiento,

                    diasDiferencia:
                        recordatorio
                            .diasDiferencia ??
                        0,

                    tipoRecordatorio:
                        recordatorio
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

            if (
                !resultadoEnvio.ok
            ) {
                await prisma.rcvRecordatorioEnvio.update({
                    where: {
                        id:
                            recordatorio.id,
                    },

                    data: {
                        estado:
                            "ERROR",

                        procesandoAt:
                            null,

                        error:
                            resultadoEnvio
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

            const asunto =
                construirAsuntoCobranza({
                    empresaKey:
                        recordatorio
                            .empresaKey as
                        EmpresaKey,

                    folio:
                        recordatorio
                            .folio,

                    tipoRecordatorio:
                        recordatorio
                            .tipoRecordatorio,
                });

            await prisma.rcvRecordatorioEnvio.update({
                where: {
                    id:
                        recordatorio.id,
                },

                data: {
                    estado:
                        "ENVIADO",

                    asunto,

                    enviadoAt:
                        new Date(),

                    procesandoAt:
                        null,

                    error:
                        null,
                },
            });

            enviados++;

            console.log(
                "[COBRANZA ENVÍO] ✅ Recordatorio completado",
                {
                    id:
                        recordatorio.id,

                    empresa:
                        recordatorio
                            .empresaKey,

                    folio:
                        recordatorio
                            .folio,

                    email:
                        recordatorio
                            .emailDestino,
                }
            );
        } catch (
        error
        ) {
            const message =
                error instanceof Error
                    ? error.message
                    : String(
                        error
                    );

            errores++;

            console.error(
                "[COBRANZA ENVÍO] ❌ Error procesando recordatorio",
                {
                    id:
                        recordatorio.id,

                    error:
                        message,
                }
            );

            /*
             * Intentamos liberar el registro.
             */
            try {
                await prisma.rcvRecordatorioEnvio.update({
                    where: {
                        id:
                            recordatorio.id,
                    },

                    data: {
                        estado:
                            "ERROR",

                        procesandoAt:
                            null,

                        error:
                            message,
                    },
                });
            } catch (
            updateError
            ) {
                console.error(
                    "[COBRANZA ENVÍO] ❌ No fue posible actualizar estado ERROR",
                    {
                        id:
                            recordatorio.id,

                        error:
                            updateError,
                    }
                );
            }
        }
    }

    console.log(
        "[COBRANZA ENVÍO] Resumen",
        {
            recuperados,

            encontrados:
                pendientes.length,

            procesados,

            enviados,

            errores,

            omitidos,
        }
    );

    return {
        recuperados,

        procesados,

        enviados,

        errores,

        omitidos,
    };
}