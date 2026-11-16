// src/jobs/funnel-avisos.cron.ts
import cron from "node-cron";
import { horaChileActualFunnel, procesarAvisosFunnel, } from "../service/oportunidades/oportunidades-avisos.service.js";
const LOG = "[FUNNEL AVISOS]";
const HORA_DEFECTO = 7;
/*
 * Una vez al día, a FUNNEL_AVISOS_HORA (Chile, 7 por defecto): avisa al
 * responsable las fechas de sus oportunidades a 3, 1 y 0 días.
 *
 * Si el backend se reinicia después de esa hora (deploy), corre una vez
 * a los 2 minutos. No duplica: lo enviado queda en OportunidadFechaAviso.
 *
 * FUNNEL_AVISOS_CRON=false → desactivado.
 * En local SIEMPRE false: el .env apunta a producción y enviaría avisos reales.
 */
export function startFunnelAvisosCron() {
    if (process.env
        .FUNNEL_AVISOS_CRON
        ?.trim()
        .toLowerCase() ===
        "false") {
        console.log(`${LOG} Cron desactivado (FUNNEL_AVISOS_CRON=false).`);
        return;
    }
    const horaEnv = Number(process.env
        .FUNNEL_AVISOS_HORA);
    const hora = Number.isInteger(horaEnv) &&
        horaEnv >= 0 &&
        horaEnv <= 23
        ? horaEnv
        : HORA_DEFECTO;
    let ejecutando = false;
    const ejecutar = async (origen) => {
        if (ejecutando) {
            return;
        }
        ejecutando =
            true;
        try {
            const r = await procesarAvisosFunnel();
            console.log(LOG, {
                origen,
                hoy: r.hoy,
                oportunidades: r.oportunidadesRevisadas,
                avisos: r.avisos,
                sinDestinatario: r.sinDestinatario,
                correos: r.correos.length,
                errores: r.correos.filter((c) => !c.ok).length,
            });
        }
        catch (error) {
            console.error(`${LOG} ❌ Error:`, error instanceof Error
                ? error.message
                : error);
        }
        finally {
            ejecutando =
                false;
        }
    };
    cron.schedule(`0 ${hora} * * *`, () => {
        void ejecutar("cron");
    }, {
        timezone: "America/Santiago",
    });
    console.log(`${LOG} Programado a las ${hora}:00 (America/Santiago).`);
    if (horaChileActualFunnel() >=
        hora) {
        setTimeout(() => {
            void ejecutar("inicio");
        }, 2 * 60_000);
    }
}
//# sourceMappingURL=funnel-avisos.cron.js.map