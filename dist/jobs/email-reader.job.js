// src/jobs/email-reader.job.ts
import cron from 'node-cron';
import { graphReaderService } from '../service/email/graph-reader.service.js';
export function startEmailReaderJob() {
    cron.schedule('/2 * * * *', async () => {
        console.log('🔄 [CRON] Leyendo emails...');
        try {
            await graphReaderService.readUnreadEmails();
        }
        catch (error) {
            console.error('❌ [CRON] Error:', error.message);
        }
    });
    console.log('✅ Job de emails iniciado (cada 2 minutos)');
}
//# sourceMappingURL=email-reader.job.js.map