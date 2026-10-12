import { Router } from 'express';
import { authRequired } from '../middleware/auth.js';
import * as documentService from '../services/documentService.js';
import { config } from '../config.js';

const router = Router();
router.use(authRequired);

function fail(res, err) {
  res.status(err.status || 400).json({ error: err.message });
}

router.get('/meta', (req, res) => {
  res.json({
    types: documentService.documentTypes(),
    merchant: documentService.merchantProfile(),
    dataProfile: config.dataProfile,
    fbr: { connected: false, live: false },
  });
});

router.get('/candidates', (req, res) => {
  res.json({ candidates: documentService.unissuedSalesCandidates() });
});

router.get('/', (req, res) => {
  res.json({
    documents: documentService.listDocuments({
      type: req.query.type || '',
      start: req.query.start || '',
      end: req.query.end || '',
      q: req.query.q || '',
      status: req.query.status || '',
    }),
  });
});

router.get('/:id', (req, res) => {
  const document = documentService.getDocument(req.params.id);
  if (!document) return res.status(404).json({ error: 'Document not found' });
  res.json({ document });
});

router.post('/', (req, res) => {
  try {
    const result = documentService.issueDocument(req.body || {});
    res.status(result.duplicate ? 200 : 201).json(result);
  } catch (err) {
    fail(res, err);
  }
});

router.post('/:id/void', (req, res) => {
  try {
    res.json(documentService.voidDocument(req.params.id, req.body?.reason || ''));
  } catch (err) {
    fail(res, err);
  }
});

export default router;
