// src/jobs/mercado-publico-avisos.cron.ts
import cron from "node-cron";

import {
    sincronizarHitosLicitacionesVigentes,
    sincronizarHitosNuevasPorCerrar,
} from "../service/mercado-publico/mercado-publico-hitos.service.js";

import {
    horaChileActual,
    procesarAvisosLicitaciones,
    type CambioEstadoLicitacion,
} from "../service/mercado-publico/mercado-publico-avisos.service.js";

import {
    sincronizarOportunidadesMercadoPublico,
} from "../service/mercado-publico/mercado-publico.service.js";

const LOG =
    "[MERCADO PUBLICO AVISOS]";

const HORA_DEFECTO =
    7;

/*
 * Una vez al día, a MERCADO_PUBLICO_AVISOS_HORA (Chile, 7 por defecto):
 *   1. Sincroniza hitos y estado de las licitaciones vigentes
 *      (INTERESANTE con cierre pendiente, CONVERTIDA abiertas).
 *   2. Envía los avisos de hitos (7, 3, 1 y 0 días) y los cambios de estado,
 *      incluida la sección "Sin revisar y por cerrar" (NUEVA).
 *   3. Refresca hitos de las NUEVA que cierran en los próximos 8 días
 *      (prórrogas; se reflejan en los avisos del día siguiente).
 *   4. Busca licitaciones nuevas (lo mismo que el botón "Actualizar
 *      Mercado Público"; máx. 20 detalles por ejecución).
 * Cada paso es independiente: si falla la API, igual se envían los
 * avisos con los datos guardados.
 *
 * Si el backend se reinicia después de esa hora (deploy), a los 2 minutos
 * corre SOLO el paso 2 (sin consultar la API). No duplica: lo enviado
 * queda en LicitacionHitoAviso.
 *
 * MERCADO_PUBLICO_AVISOS_CRON=false → desactivado.
 * En local SIEMPRE false: el .env apunta a producción y enviaría avisos reales.
 */
export function startMercadoPublicoAvisosCron() {

    if (
        process.env
            .MERCADO_PUBLICO_AVISOS_CRON
            ?.trim()
            .toLowerCase() ===
        "false"
    ) {
        console.log(
            `${LOG} Cron desactivado (MERCADO_PUBLICO_AVISOS_CRON=false).`,
        );

        return;
    }

    const horaEnv =
        Number(
            process.env
                .MERCADO_PUBLICO_AVISOS_HORA,
        );

    const hora =
        Number.isInteger(horaEnv) &&
            horaEnv >= 0 &&
            horaEnv <= 23
            ? horaEnv
            : HORA_DEFECTO;

    let ejecutando =
        false;

    const ejecutar =
        async (
            origen:
                | "cron"
                | "inicio",
        ) => {
            if (
                ejecutando
            ) {
                return;
            }

            ejecutando =
                true;

            try {
                let cambiosEstado: CambioEstadoLicitacion[] =
                    [];

                /* 1. Hitos y estado de las vigentes (solo en el cron diario). */
                if (
                    origen ===
                    "cron"
                ) {
                    try {
                        const sync =
                            await sincronizarHitosLicitacionesVigentes();

                        cambiosEstado =
                            sync.cambiosEstado;

                        console.log(
                            `${LOG} Hitos`,
                            {
                                candidatas: sync.candidatas,
                                sincronizadas: sync.sincronizadas,
                                creados: sync.hitosCreados,
                                actualizados: sync.hitosActualizados,
                                desactivados: sync.hitosDesactivados,
                                cambiosEstado: sync.cambiosEstado.length,
                                errores: sync.errores.length,
                            },
                        );
                    } catch (
                    error
                    ) {
                        console.error(
                            `${LOG} ❌ Error sincronizando hitos:`,
                            error instanceof Error
                                ? error.message
                                : error,
                        );
                    }
                }

                /* 2. Avisos. */
                try {
                    const r =
                        await procesarAvisosLicitaciones({
                            cambiosEstado,
                        });

                    console.log(
                        `${LOG} Avisos`,
                        {
                            origen,
                            hoy: r.hoy,
                            avisos: r.avisos,
                            avisosNuevas: r.avisosNuevas,
                            cambiosEstado: r.cambiosEstado,
                            sinDestinatarios: r.sinDestinatarios,
                            correos: r.correos.length,
                            errores: r.correos.filter(
                                (c) =>
                                    !c.ok,
                            ).length,
                        },
                    );
                } catch (
                error
                ) {
                    console.error(
                        `${LOG} ❌ Error enviando avisos:`,
                        error instanceof Error
                            ? error.message
                            : error,
                    );
                }

                /* 3. Hitos de NUEVA por cerrar (solo en el cron diario). */
                if (
                    origen ===
                    "cron"
                ) {
                    try {
                        const n =
                            await sincronizarHitosNuevasPorCerrar();

                        console.log(
                            `${LOG} Hitos NUEVA por cerrar`,
                            {
                                candidatas: n.candidatas,
                                sincronizadas: n.sincronizadas,
                                actualizados: n.hitosActualizados,
                                desactivados: n.hitosDesactivados,
                                errores: n.errores.length,
                            },
                        );
                    } catch (
                    error
                    ) {
                        console.error(
                            `${LOG} ❌ Error sincronizando NUEVA por cerrar:`,
                            error instanceof Error
                                ? error.message
                                : error,
                        );
                    }
                }

                /* 4. Licitaciones nuevas (solo en el cron diario). */
                if (
                    origen ===
                    "cron"
                ) {
                    try {
                        const d =
                            await sincronizarOportunidadesMercadoPublico();

                        console.log(
                            `${LOG} Búsqueda`,
                            d,
                        );
                    } catch (
                    error
                    ) {
                        console.error(
                            `${LOG} ❌ Error buscando licitaciones nuevas:`,
                            error instanceof Error
                                ? error.message
                                : error,
                        );
                    }
                }
            } finally {
                ejecutando =
                    false;
            }
        };

    cron.schedule(
        `0 ${hora} * * *`,
        () => {
            void ejecutar(
                "cron",
            );
        },
        {
            timezone:
                "America/Santiago",
        },
    );

    console.log(
        `${LOG} Programado a las ${hora}:00 (America/Santiago).`,
    );

    if (
        horaChileActual() >=
        hora
    ) {
        setTimeout(
            () => {
                void ejecutar(
                    "inicio",
                );
            },
            2 * 60_000,
        );
    }
}