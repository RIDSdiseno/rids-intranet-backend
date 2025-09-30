import { Router } from 'express';

const router = Router();

router.get('/health', (_req, res) => res.json({ ok: true, service: 'API CMR', ts: Date.now() }));

// Stubs (sin controllers aún)
router.use('/auth', (_req, res) => res.status(501).json({ ok: false, message: 'Not implemented: /auth' }));
router.use('/clientes', (_req, res) => res.status(501).json({ ok: false, message: 'Not implemented: /clientes' }));
router.use('/leads', (_req, res) => res.status(501).json({ ok: false, message: 'Not implemented: /leads' }));

export default router;
