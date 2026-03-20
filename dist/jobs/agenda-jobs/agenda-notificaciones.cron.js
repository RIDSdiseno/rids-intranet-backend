// src/jobs/agenda-notificaciones.cron.ts
import cron from "node-cron";
import { enviarNotificacionesPendientes } from "../../service/agenda.service.js";
export function startAgendaNotificacionesCron() {
    const EXPRESION_CRON = "30 8 * * *"; // ← cambiar aquí para pruebas
    cron.schedule(EXPRESION_CRON, async () => {
        console.log("[AGENDA CRON] Ejecutando envio de notificaciones pendientes...");
        try {
            const total = await enviarNotificacionesPendientes();
            console.log(`[AGENDA CRON] ✅ Completado — agendas notificadas: ${total}`);
        }
        catch (error) {
            console.error("[AGENDA CRON] ❌ Error al enviar notificaciones:", error);
        }
    });
    console.log(`[AGENDA CRON] Programado con expresion: "${EXPRESION_CRON}"`);
}
//# sourceMappingURL=agenda-notificaciones.cron.js.map