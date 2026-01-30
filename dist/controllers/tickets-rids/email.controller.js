import { imapReaderService } from '../../service/email/imap-reader.service.js';
/**
 * Procesa emails manualmente (para testing)
 */
export async function processEmails(req, res) {
    try {
        console.log('📧 Procesando emails manualmente...');
        await imapReaderService.readUnreadEmails();
        return res.json({
            ok: true,
            message: 'Emails procesados correctamente'
        });
    }
    catch (error) {
        console.error('[email] processEmails error:', error);
        return res.status(500).json({
            ok: false,
            message: 'Error procesando emails',
            error: error.message
        });
    }
}
//# sourceMappingURL=email.controller.js.map