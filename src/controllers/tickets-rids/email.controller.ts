// src/controllers/tickets-rids/email.controller.ts
import type { Request, Response } from 'express';
import { graphReaderService } from '../../service/email/graph-reader.service.js';

export async function processEmails(req: Request, res: Response) {
    try {
        console.log('📧 Procesando emails manualmente...');
        await graphReaderService.readInboxEmails();

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