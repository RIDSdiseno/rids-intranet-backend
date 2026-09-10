// src/service/baseapi/cobranza/cobranza-scheduler.service.ts

import {
    prisma,
} from "../../../lib/prisma.js";

import {
    procesarCobranzaAutomatica,
} from "./cobranza-automatico.service.js";

import {
    procesarEnviosCobranza,
} from "./cobranza-envio.service.js";

import type {
    EmpresaKey,
} from "./cobranza-estado.service.js";

/* =========================================================
   CONFIG
========================================================= */

const INTERVALO_MS =
    60_000;

const TIMEZONE =
    "America/Santiago";

/*
 * Evita ejecutar dos veces la misma acción
 * durante el mismo minuto.
 *
 * Formato:
 *
 * 2026-09-09|econnet|PREPARAR
 * 2026-09-09|econnet|ENVIAR
 */
const ejecuciones =
    new Set<string>();

let timer:
    NodeJS.Timeout |
    null =
    null;

let ejecutando =
    false;

/* =========================================================
   FECHA / HORA CHILE
========================================================= */

function getFechaHoraChile() {
    const now =
        new Date();

    const parts =
        new Intl.DateTimeFormat(
            "en-CA",
            {
                timeZone:
                    TIMEZONE,

                year:
                    "numeric",

                month:
                    "2-digit",

                day:
                    "2-digit",

                hour:
                    "2-digit",

                minute:
                    "2-digit",

                hourCycle:
                    "h23",
            }
        ).formatToParts(
            now
        );

    const map =
        Object.fromEntries(
            parts.map(
                (part) => [
                    part.type,
                    part.value,
                ]
            )
        );

    const fecha =
        `${map.year}-${map.month}-${map.day}`;

    const hora =
        `${map.hour}:${map.minute}`;

    return {
        fecha,
        hora,
        iso:
            now.toISOString(),
    };
}

/* =========================================================
   HELPERS
========================================================= */

function normalizarHora(
    value:
        string | null | undefined
): string | null {
    if (
        !value
    ) {
        return null;
    }

    const valueTrimmed =
        String(
            value
        ).trim();

    const match =
        /^(\d{1,2}):(\d{2})/.exec(
            valueTrimmed
        );

    if (
        !match
    ) {
        return null;
    }

    const horas =
        Number(
            match[1]
        );

    const minutos =
        Number(
            match[2]
        );

    if (
        horas < 0 ||
        horas > 23 ||
        minutos < 0 ||
        minutos > 59
    ) {
        return null;
    }

    return `${String(horas).padStart(2, "0")}:${String(minutos).padStart(2, "0")}`;
}

function getEjecucionKey(
    fecha:
        string,

    empresa:
        EmpresaKey,

    accion:
        "PREPARAR" |
        "ENVIAR"
) {
    return [
        fecha,
        empresa,
        accion,
    ].join("|");
}

/* =========================================================
   CICLO
========================================================= */

async function ejecutarCicloCobranza() {
    if (
        ejecutando
    ) {
        console.log(
            "[COBRANZA SCHEDULER] ⏭ Ciclo anterior todavía ejecutándose"
        );

        return;
    }

    ejecutando =
        true;

    try {
        const {
            fecha,
            hora,
            iso,
        } =
            getFechaHoraChile();

        const configs =
            await prisma
                .rcvCobranzaConfig
                .findMany({
                    where: {
                        activo:
                            true,
                    },

                    orderBy: {
                        empresaKey:
                            "asc",
                    },
                });

        console.log(
            "[COBRANZA SCHEDULER] ⏱ Ciclo",
            {
                fecha,
                hora,
                timezone:
                    TIMEZONE,

                nowIso:
                    iso,

                configsActivas:
                    configs.length,
            }
        );

        for (
            const config
            of configs
        ) {
            const empresa =
                config
                    .empresaKey as
                EmpresaKey;

            const horaConsulta =
                normalizarHora(
                    config
                        .horaConsultaSii
                );

            const horaCobranza =
                normalizarHora(
                    config
                        .horaCobranza
                );

            /*
             * =================================================
             * PREPARACIÓN
             * =================================================
             */

            if (
                horaConsulta &&
                hora ===
                horaConsulta
            ) {
                const key =
                    getEjecucionKey(
                        fecha,
                        empresa,
                        "PREPARAR"
                    );

                if (
                    !ejecuciones.has(
                        key
                    )
                ) {
                    ejecuciones.add(
                        key
                    );

                    console.log(
                        "[COBRANZA SCHEDULER] 🔎 Preparando cobranza",
                        {
                            empresa,
                            hora,
                        }
                    );

                    try {
                        const resultado =
                            await procesarCobranzaAutomatica({
                                empresas: [
                                    empresa,
                                ],

                                mesesAnalizar:
                                    1,

                                registrarPendientes:
                                    true,
                            });

                        console.log(
                            "[COBRANZA SCHEDULER] ✅ Preparación completada",
                            {
                                empresa,

                                candidatos:
                                    resultado
                                        .totalCandidatos,

                                pendientes:
                                    resultado
                                        .totalPendientesEnvio,
                            }
                        );
                    } catch (
                    error
                    ) {
                        ejecuciones.delete(
                            key
                        );

                        console.error(
                            "[COBRANZA SCHEDULER] ❌ Error preparando",
                            {
                                empresa,

                                error:
                                    error instanceof Error
                                        ? error.message
                                        : String(
                                            error
                                        ),
                            }
                        );
                    }
                }
            }

            /*
             * =================================================
             * ENVÍO
             * =================================================
             */

            if (
                config
                    .envioAutomatico &&
                horaCobranza &&
                hora ===
                horaCobranza
            ) {
                const key =
                    getEjecucionKey(
                        fecha,
                        empresa,
                        "ENVIAR"
                    );

                if (
                    !ejecuciones.has(
                        key
                    )
                ) {
                    ejecuciones.add(
                        key
                    );

                    console.log(
                        "[COBRANZA SCHEDULER] 📤 Procesando envíos",
                        {
                            empresa,
                            hora,
                        }
                    );

                    try {
                        const resultado =
                            await procesarEnviosCobranza({
                                empresa,

                                limite:
                                    100,
                            });

                        console.log(
                            "[COBRANZA SCHEDULER] ✅ Envío completado",
                            {
                                empresa,

                                ...resultado,
                            }
                        );
                    } catch (
                    error
                    ) {
                        ejecuciones.delete(
                            key
                        );

                        console.error(
                            "[COBRANZA SCHEDULER] ❌ Error enviando",
                            {
                                empresa,

                                error:
                                    error instanceof Error
                                        ? error.message
                                        : String(
                                            error
                                        ),
                            }
                        );
                    }
                }
            }
        }

        /*
         * Limpiar claves antiguas.
         *
         * Solo mantenemos las del día actual.
         */
        for (
            const key
            of ejecuciones
        ) {
            if (
                !key.startsWith(
                    `${fecha}|`
                )
            ) {
                ejecuciones.delete(
                    key
                );
            }
        }
    } catch (
    error
    ) {
        console.error(
            "[COBRANZA SCHEDULER] ❌ Error en ciclo",
            error
        );
    } finally {
        ejecutando =
            false;
    }
}

/* =========================================================
   START / STOP
========================================================= */

export function iniciarCobranzaScheduler() {
    if (
        timer
    ) {
        console.log(
            "[COBRANZA SCHEDULER] ⚠ Ya estaba iniciado"
        );

        return;
    }

    console.log(
        "[COBRANZA SCHEDULER] ✅ Scheduler iniciado",
        {
            cadaMs:
                INTERVALO_MS,

            timezone:
                TIMEZONE,
        }
    );

    /*
     * Ejecutamos inmediatamente al arrancar
     * para tener diagnóstico desde el primer momento.
     */
    void ejecutarCicloCobranza();

    timer =
        setInterval(
            () => {
                void ejecutarCicloCobranza();
            },
            INTERVALO_MS
        );
}

export function detenerCobranzaScheduler() {
    if (
        !timer
    ) {
        return;
    }

    clearInterval(
        timer
    );

    timer =
        null;

    console.log(
        "[COBRANZA SCHEDULER] 🛑 Scheduler detenido"
    );
}