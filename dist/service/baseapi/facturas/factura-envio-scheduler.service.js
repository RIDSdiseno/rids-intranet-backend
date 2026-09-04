// src/service/baseapi/facturas/factura-envio-scheduler.service.ts
import { prisma, } from "../../../lib/prisma.js";
import { prepararFacturasEmitidas, } from "./factura-envio-automatico.service.js";
import { procesarEnviosFactura, } from "./factura-envio.service.js";
/* =========================================================
   CONFIG
========================================================= */
const TIME_ZONE = "America/Santiago";
/*
 * Evita lanzar un segundo ciclo desde la MISMA
 * instancia Node si el anterior aún está trabajando.
 *
 * La protección entre distintas réplicas se hace
 * mediante ultimaConsultaAt / ultimoEnvioAt.
 */
let cicloEnCurso = false;
/* =========================================================
   FECHA / HORA CHILE
========================================================= */
function getFechaHoraChile() {
    const now = new Date();
    const parts = new Intl.DateTimeFormat("en-CA", {
        timeZone: TIME_ZONE,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hour12: false,
    }).formatToParts(now);
    const get = (type) => parts.find((item) => item.type ===
        type)?.value ??
        "";
    return {
        now,
        fecha: `${get("year")}-${get("month")}-${get("day")}`,
        hora: `${get("hour")}:${get("minute")}`,
        horaCompleta: `${get("hour")}:${get("minute")}:${get("second")}`,
    };
}
/* =========================================================
   CLAIM ATÓMICO CONSULTA
========================================================= */
async function intentarTomarConsulta(id, ahora) {
    /*
     * Inicio del minuto actual.
     *
     * Date representa un instante absoluto, por lo que para
     * este lock no necesitamos convertir a America/Santiago.
     *
     * Ejemplo:
     *
     * ahora:
     * 2026-09-04T15:42:22.633Z
     *
     * inicioMinuto:
     * 2026-09-04T15:42:00.000Z
     */
    const inicioMinuto = new Date(Math.floor(ahora.getTime() /
        60_000) *
        60_000);
    /*
     * UPDATE atómico.
     *
     * Solamente podrá modificar la fila si:
     *
     * - nunca se ejecutó
     * - o la última ejecución fue antes del minuto actual
     *
     * Si dos réplicas hacen esto simultáneamente:
     *
     * Replica A → count = 1
     * Replica B → count = 0
     *
     * Solo A ejecutará la preparación.
     */
    const resultado = await prisma
        .rcvFacturaEnvioConfig
        .updateMany({
        where: {
            id,
            OR: [
                {
                    ultimaConsultaAt: null,
                },
                {
                    ultimaConsultaAt: {
                        lt: inicioMinuto,
                    },
                },
            ],
        },
        data: {
            ultimaConsultaAt: ahora,
        },
    });
    const tomado = resultado.count ===
        1;
    if (!tomado) {
        console.log("[FACTURA SCHEDULER] 🔒 Consulta tomada por otra instancia", {
            configId: id,
            inicioMinuto: inicioMinuto
                .toISOString(),
        });
    }
    return tomado;
}
/* =========================================================
   CLAIM ATÓMICO ENVÍO
========================================================= */
async function intentarTomarEnvio(id, ahora) {
    const inicioMinuto = new Date(Math.floor(ahora.getTime() /
        60_000) *
        60_000);
    const resultado = await prisma
        .rcvFacturaEnvioConfig
        .updateMany({
        where: {
            id,
            OR: [
                {
                    ultimoEnvioAt: null,
                },
                {
                    ultimoEnvioAt: {
                        lt: inicioMinuto,
                    },
                },
            ],
        },
        data: {
            ultimoEnvioAt: ahora,
        },
    });
    const tomado = resultado.count ===
        1;
    if (!tomado) {
        console.log("[FACTURA SCHEDULER] 🔒 Envío tomado por otra instancia", {
            configId: id,
            inicioMinuto: inicioMinuto
                .toISOString(),
        });
    }
    return tomado;
}
/* =========================================================
   PROCESAR CONFIG
========================================================= */
async function procesarConfiguracion(config, ahora, horaActual) {
    const empresa = config
        .empresaKey;
    /*
     * =====================================================
     * CONSULTA + PREPARACIÓN
     * =====================================================
     */
    if (config.consultaSiiActiva &&
        horaActual ===
            config.horaConsulta) {
        const tomado = await intentarTomarConsulta(config.id, ahora);
        if (!tomado) {
            console.log("[FACTURA SCHEDULER] ⏭ Consulta ya tomada este minuto", {
                empresa,
                horaActual,
            });
        }
        else {
            console.log("[FACTURA SCHEDULER] 🔎 Preparando facturas", {
                empresa,
                horaActual,
            });
            try {
                const resultado = await prepararFacturasEmitidas({
                    empresas: [
                        empresa,
                    ],
                    refrescarPeriodosRecientes: true,
                });
                console.log("[FACTURA SCHEDULER] ✅ Preparación terminada", {
                    empresa,
                    candidatosEnviables: resultado
                        .candidatosEnviables,
                    nuevos: resultado
                        .nuevos,
                    existentes: resultado
                        .existentes,
                });
            }
            catch (error) {
                console.error("[FACTURA SCHEDULER] ❌ Error preparando facturas", {
                    empresa,
                    error: error instanceof Error
                        ? error.message
                        : String(error),
                });
            }
        }
    }
    /*
     * =====================================================
     * ENVÍO
     * =====================================================
     */
    if (config.envioAutomatico &&
        horaActual ===
            config.horaEnvio) {
        const tomado = await intentarTomarEnvio(config.id, ahora);
        if (!tomado) {
            console.log("[FACTURA SCHEDULER] ⏭ Envío ya tomado este minuto", {
                empresa,
                horaActual,
            });
            return;
        }
        console.log("[FACTURA SCHEDULER] 📤 Procesando pendientes", {
            empresa,
            horaActual,
        });
        try {
            const resultado = await procesarEnviosFactura({
                empresa,
                limite: 20,
            });
            console.log("[FACTURA SCHEDULER] ✅ Envío terminado", {
                empresa,
                encontrados: resultado
                    .encontrados,
                procesados: resultado
                    .procesados,
                enviados: resultado
                    .enviados,
                errores: resultado
                    .errores,
                cancelados: resultado
                    .cancelados,
            });
        }
        catch (error) {
            console.error("[FACTURA SCHEDULER] ❌ Error procesando envíos", {
                empresa,
                error: error instanceof Error
                    ? error.message
                    : String(error),
            });
        }
    }
}
/* =========================================================
   CICLO
========================================================= */
export async function ejecutarCicloFacturasAutomaticas() {
    if (cicloEnCurso) {
        console.log("[FACTURA SCHEDULER] ⏭ Ciclo anterior todavía en ejecución");
        return;
    }
    cicloEnCurso =
        true;
    try {
        const { now, fecha, hora, horaCompleta, } = getFechaHoraChile();
        const configs = await prisma
            .rcvFacturaEnvioConfig
            .findMany({
            where: {
                activo: true,
            },
            select: {
                id: true,
                empresaKey: true,
                activo: true,
                consultaSiiActiva: true,
                envioAutomatico: true,
                horaConsulta: true,
                horaEnvio: true,
            },
        });
        /*
         * No imprimimos un log cada minuto cuando no
         * hay nada que ejecutar para evitar llenar Railway.
         */
        const configRelevante = configs.some((config) => (config
            .consultaSiiActiva &&
            hora ===
                config
                    .horaConsulta) ||
            (config
                .envioAutomatico &&
                hora ===
                    config
                        .horaEnvio));
        if (configRelevante) {
            console.log("[FACTURA SCHEDULER] ⏱ Ciclo", {
                fecha,
                hora: horaCompleta,
                configsActivas: configs.length,
            });
        }
        for (const config of configs) {
            await procesarConfiguracion(config, now, hora);
        }
    }
    catch (error) {
        console.error("[FACTURA SCHEDULER] ❌ Error general", {
            error: error instanceof Error
                ? error.message
                : String(error),
        });
    }
    finally {
        cicloEnCurso =
            false;
    }
}
let schedulerIniciado = false;
export function iniciarSchedulerFacturasAutomaticas() {
    if (schedulerIniciado) {
        return;
    }
    schedulerIniciado =
        true;
    console.log("[FACTURA SCHEDULER] ✅ Scheduler iniciado");
    /*
     * Ejecutamos un primer chequeo al arrancar,
     * pero las acciones solo ocurrirán si coincide
     * horaConsulta/horaEnvio.
     */
    void ejecutarCicloFacturasAutomaticas();
    setInterval(() => {
        void ejecutarCicloFacturasAutomaticas();
    }, 60_000);
}
//# sourceMappingURL=factura-envio-scheduler.service.js.map