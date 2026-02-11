// src/jobs/email-reader.job.ts
import cron from 'node-cron';
import { graphReaderService } from '../service/email/graph-reader.service.js';

// Job programado para leer emails cada 1 minuto (puedes ajustar la frecuencia)
export function startEmailReaderJob() {
    cron.schedule('* * * * *', async () => {
        console.log('🔄 [CRON] Leyendo emails...');
        try {
            await graphReaderService.readUnreadEmails();
        } catch (error: any) {
            console.error('❌ [CRON] Error:', error.message);
        }
    });

    console.log('✅ Job de emails iniciado (cada 1 minuto)');
}