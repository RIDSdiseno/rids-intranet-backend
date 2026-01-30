// src/jobs/email-reader.job.ts
import cron from 'node-cron';
import { imapReaderService } from '../service/email/imap-reader.service.js';
export function startEmailReaderJob() {
    // Ejecutar cada 2 minutos
    cron.schedule('*/2 * * * *', async () => {
        console.log('🔄 [CRON] Leyendo emails...');
        try {
            await imapReaderService.readUnreadEmails();
        }
        catch (error) {
            console.error('❌ [CRON] Error:', error.message);
        }
    });
    console.log('✅ Job de emails iniciado (cada 2 minutos)');
}
//# sourceMappingURL=email-reader.job.js.map