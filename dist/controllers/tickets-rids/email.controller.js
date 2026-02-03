import { graphReaderService } from '../../service/email/graph-reader.service.js';
export async function processEmails(req, res) {
    try {
        console.log('📧 Procesando emails manualmente...');
        await graphReaderService.readUnreadEmails();
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