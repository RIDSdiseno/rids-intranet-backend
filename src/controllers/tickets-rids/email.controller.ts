// src/controllers/tickets-rids/email.controller.ts
import type { Request, Response } from 'express';
import { imapReaderService } from '../../service/email/imap-reader.service.js';

/**
 * Procesa emails manualmente (para testing)
 */
export async function processEmails(req: Request, res: Response) {
    try {
        console.log('📧 Procesando emails manualmente...');
        await imapReaderService.readUnreadEmails();

        return res.json({
            ok: true,
            message: 'Emails procesados correctamente'
        });
    } catch (error: any) {
        console.error('[email] processEmails error:', error);
        return res.status(500).json({
            ok: false,
            message: 'Error procesando emails',
            error: error.message
        });
    }
}