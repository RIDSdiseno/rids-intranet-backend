import cron from "node-cron";
import { cerrarAgendasPendientesDelDia } from "../../service/agenda.service.js";
export function startAgendaCierreCron() {
    const EXPRESION_CRON = "59 23 * * *";
    cron.schedule(EXPRESION_CRON, async () => {
        console.log("[AGENDA CIERRE CRON] Ejecutando cierre automatico de agendas...");
        try {
            const total = await cerrarAgendasPendientesDelDia();
            console.log(`[AGENDA CIERRE CRON] Completado - agendas cerradas: ${total}`);
        }
        catch (error) {
            console.error("[AGENDA CIERRE CRON] Error al cerrar agendas:", error);
        }
    });
    console.log(`[AGENDA CIERRE CRON] Programado con expresion: "${EXPRESION_CRON}"`);
}
//# sourceMappingURL=agenda-cierre.cron.js.map