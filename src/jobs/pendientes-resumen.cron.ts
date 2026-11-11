// src/jobs/pendientes-resumen.cron.ts
import cron from "node-cron";

import {
    procesarResumenPendientes,
} from "../service/pendientes/pendientes-resumen.service.js";

const LOG =
    "[PENDIENTES RESUMEN]";

/** Lunes a viernes a las 08:30 (Chile). */
const EXPRESION_DEFECTO =
    "30 8 * * 1-5";

/*
 * Resumen de pendientes por correo.
 *
 * PENDIENTES_RESUMEN_CRON:
 *   (sin definir) -> "30 8 * * 1-5"
 *   "false"       -> desactivado (usar en local: el .env apunta a producción)
 *   otra expresión cron -> por ejemplo "0 9 * * 1" (lunes 09:00)
 *
 * A diferencia de los avisos de suscripciones, NO corre al iniciar el
 * backend: así un deploy no reenvía el resumen del día.
 */
export function startPendientesResumenCron() {

    const valor =
        process.env
            .PENDIENTES_RESUMEN_CRON
            ?.trim();

    if (
        valor?.toLowerCase() ===
        "false"
    ) {
        console.log(
            `${LOG} Cron desactivado (PENDIENTES_RESUMEN_CRON=false).`,
        );

        return;
    }

    const expresion =
        valor ||
        EXPRESION_DEFECTO;

    if (
        !cron.validate(
            expresion,
        )
    ) {
        console.error(
            `${LOG} ❌ Expresión cron inválida: "${expresion}". No se programa.`,
        );

        return;
    }

    let ejecutando =
        false;

    cron.schedule(
        expresion,
        async () => {
            if (
                ejecutando
            ) {
                return;
            }

            ejecutando =
                true;

            try {
                const r =
                    await procesarResumenPendientes();

                console.log(
                    LOG,
                    {
                        hoy: r.hoy,
                        enviado: r.enviado,
                        motivo: r.motivo,
                        destinatarios: r.destinatarios.length,
                        ...r.conteos,
                    },
                );
            } catch (
            error
            ) {
                console.error(
                    `${LOG} ❌ Error:`,
                    error instanceof Error
                        ? error.message
                        : error,
                );
            } finally {
                ejecutando =
                    false;
            }
        },
        {
            timezone:
                "America/Santiago",
        },
    );

    console.log(
        `${LOG} Programado: "${expresion}" (America/Santiago)`,
    );
}