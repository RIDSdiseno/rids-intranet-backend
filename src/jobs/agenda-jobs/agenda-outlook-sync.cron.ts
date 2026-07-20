import cron from "node-cron";
import { sincronizarAgendaAutomaticaOutlook } from "../../service/agenda.service.js";

export function startAgendaOutlookSyncCron() {
    if (process.env.ENABLE_OUTLOOK_SYNC_CRON !== "true") {
        console.log(
            "[AGENDA OUTLOOK AUTO CRON] Desactivado (ENABLE_OUTLOOK_SYNC_CRON distinto de \"true\")."
        );
        return;
    }

    const EXPRESION_CRON = "*/10 * * * *";
    let isRunning = false;

    // console.log("[AGENDA OUTLOOK AUTO CRON] Ejecutando sync inicial...");
    sincronizarAgendaAutomaticaOutlook()
        .then(r => console.log("[AGENDA OUTLOOK AUTO CRON] Resultado inicial:", JSON.stringify(r, null, 2)))
        .catch(e => console.error("[AGENDA OUTLOOK AUTO CRON] Error inicial:", e));

    cron.schedule(EXPRESION_CRON, async () => {
        if (isRunning) return;
        isRunning = true;
        try {
            const resultado = await sincronizarAgendaAutomaticaOutlook();
           // console.log("[AGENDA OUTLOOK AUTO CRON] Resultado:", JSON.stringify(resultado));
        } catch (e) {
           // console.error("[AGENDA OUTLOOK AUTO CRON] Error:", e);
        } finally {
            isRunning = false;
        }
    });

   // console.log(`[AGENDA OUTLOOK AUTO CRON] Programado con expresion: "${EXPRESION_CRON}"`);
}