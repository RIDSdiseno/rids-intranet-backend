// jobs/teamviewer.cron.ts
import cron from "node-cron";
import { runTeamViewerSyncInternal } from "../controllers/controllers-teamviewer/teamviewer.controller.js";
// Este cron se encarga de sincronizar los datos de TeamViewer cada 15 minutos
export function startTeamViewerCron() {
    // Ejecutar inmediatamente al iniciar el servidor
    runTeamViewerSyncInternal()
        .then(r => console.log("🚀 Sync inicial:", r))
        .catch(e => console.error("❌ Error sync inicial:", e));
    cron.schedule("*/15 * * * *", async () => {
        console.log("⏳ Ejecutando sync automática TeamViewer...");
        try {
            const result = await runTeamViewerSyncInternal();
            console.log("✅ Sync completada:", result);
        }
        catch (error) {
            console.error("❌ Error en sync automática:", error);
        }
    });
}
//# sourceMappingURL=teamviewer.cron.js.map