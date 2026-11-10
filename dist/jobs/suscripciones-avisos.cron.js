// src/jobs/suscripciones-avisos.cron.ts
import cron from "node-cron";
import { horaAviso, horaChileActual, procesarAvisosSuscripciones, } from "../service/suscripciones-contratos/suscripciones-avisos.service.js";
/*
 * Una vez al día, a SUSCRIPCIONES_AVISO_HORA (Chile, 8 por defecto).
 *
 * Si el backend se reinicia después de esa hora (deploy), corre una vez
 * al iniciar para no perder el día. No duplica: lo ya enviado queda
 * registrado en SuscripcionContratoAviso.
 */
export function startSuscripcionesAvisosCron() {
    const hora = horaAviso();
    let isRunning = false;
    const ejecutar = async (origen) => {
        if (isRunning) {
            return;
        }
        isRunning =
            true;
        try {
            const r = await procesarAvisosSuscripciones();
            if (r.avisos > 0 ||
                r.sinDestinatarios > 0) {
                console.log("[SUSCRIPCIONES AVISOS]", {
                    origen,
                    hoy: r.hoy,
                    avisos: r.avisos,
                    enviados: r.enviados,
                    sinDestinatarios: r.sinDestinatarios,
                    vencidos: r.vencidos,
                    correos: r.correos.length,
                    errores: r.correos.filter((c) => !c.ok).length,
                });
            }
        }
        catch (error) {
            console.error("[SUSCRIPCIONES AVISOS] ❌ Error:", error instanceof Error
                ? error.message
                : error);
        }
        finally {
            isRunning =
                false;
        }
    };
    cron.schedule(`0 ${hora} * * *`, () => {
        void ejecutar("cron");
    }, {
        timezone: "America/Santiago",
    });
    if (horaChileActual() >=
        hora) {
        setTimeout(() => {
            void ejecutar("inicio");
        }, 2 * 60_000);
    }
}
//# sourceMappingURL=suscripciones-avisos.cron.js.map