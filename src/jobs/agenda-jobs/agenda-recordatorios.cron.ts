import cron from "node-cron";
import { enviarRecordatoriosPendientes } from "../../service/agenda.service.js";

export function startAgendaRecordatoriosCron() {
    const EXPRESION_CRON = "* * * * *";

    let isRunning = false;

    cron.schedule(EXPRESION_CRON, async () => {
        if (isRunning) {
            console.log("[AGENDA RECORDATORIOS CRON] ⚠️ Ya hay una ejecución en curso, se omite este ciclo.");
            return;
        }

        isRunning = true;

        console.log("[AGENDA RECORDATORIOS CRON] Buscando recordatorios...");

        try {
            const total = await enviarRecordatoriosPendientes();
            console.log(`[AGENDA RECORDATORIOS CRON] Correos enviados: ${total}`);
        } catch (error) {
            console.error("[AGENDA RECORDATORIOS CRON] Error:", error);
        } finally {
            isRunning = false;
        }
    });

    console.log(`[AGENDA RECORDATORIOS CRON] Programado con expresion: "${EXPRESION_CRON}"`);
}