import { Router } from 'express';
import multer from 'multer';
import { authRequired } from '../middleware/auth.js';
import { applyOnboardingPreview, listSheets, previewOnboarding } from '../db/onboardingService.js';

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 8 * 1024 * 1024 } });
const previews = new Map();

router.use(authRequired);

router.post('/preview', upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Upload an XLSX or CSV file' });
  try {
    const sheets = listSheets(req.file.buffer);
    const mapping = req.body.mapping ? JSON.parse(req.body.mapping) : {};
    const sheetName = req.body.sheet || sheets[0]?.name || '';
    const preview = previewOnboarding({ sheets, mapping, sheetName });
    const previewId = `${Date.now()}`;
    previews.set(previewId, preview);
    res.json({
      previewId,
      sheets: sheets.map((row) => ({ name: row.name, columns: row.columns, rowCount: row.rowCount })),
      required: ['sku', 'name', 'item_type', 'base_uom', 'opening_qty'],
      optional: ['cost', 'price', 'category', 'reorder_level', 'supplier_name'],
      note: 'Columns are never guessed. Map each required field explicitly. Apply writes only to server/data/onboarding.',
      preview,
    });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.post('/apply', (req, res) => {
  try {
    const preview = previews.get(req.body.previewId);
    if (!preview) return res.status(400).json({ error: 'Preview expired. Upload and preview again.' });
    const result = applyOnboardingPreview(preview, { confirm: req.body.confirm === true });
    res.json(result);
  } catch (err) {
    res.status(err.status || 400).json({ error: err.message });
  }
});

export default router;
