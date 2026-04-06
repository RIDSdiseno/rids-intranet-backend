// src/jobs/email-reader.job.ts
import cron from 'node-cron';
import { graphReaderService } from '../service/email/graph-reader.service.js';
let isRunning = false;
// Job programado para leer emails cada 50 segundos (ajustable según necesidades)
export function startEmailReaderJob() {
    cron.schedule('*/50 * * * * *', async () => {
        if (isRunning) {
            console.log('⏭️ [CRON] Lectura omitida: aún hay una ejecución en curso');
            return;
        }
        isRunning = true;
        console.log('🔄 [CRON] Leyendo emails...');
        try {
            await graphReaderService.readInboxEmails();
        }
        catch (error) {
            console.error('❌ [CRON] Error:', error.message);
        }
        finally {
            isRunning = false;
        }
    });
    console.log('✅ Job de emails iniciado (cada 30 segundos)');
}
//# sourceMappingURL=email-reader.job.js.map