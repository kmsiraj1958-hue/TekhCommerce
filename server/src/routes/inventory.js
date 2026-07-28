import { Router } from 'express';
import path from 'path';
import multer from 'multer';
import { authRequired } from '../middleware/auth.js';
import * as inventoryService from '../services/inventoryService.js';
import * as mnpService from '../services/mnpService.js';
import { config } from '../config.js';
import { ensureDir } from '../utils/storage.js';

const router = Router();
const upload = multer({ dest: path.join(config.files.uploads, 'tmp') });

router.get('/', (req, res) => {
  res.json({ summary: inventoryService.calculateInventory() });
});

router.post('/movements', authRequired, (req, res) => {
  const { code, qty, type, note } = req.body || {};
  const allowed = ['purchase', 'manual_add', 'return_in', 'damage', 'adjustment'];
  const quantity = parseInt(qty, 10) || 0;
  if (!code) return res.status(400).json({ error: 'Product code required' });
  if (quantity <= 0) return res.status(400).json({ error: 'Quantity must be greater than zero' });
  if (!allowed.includes(type)) return res.status(400).json({ error: 'Invalid movement type' });

  inventoryService.addMovement({ code, qty: quantity, type, note: note || '' });
  res.status(201).json({ ok: true });
});

router.post('/import-daily', authRequired, upload.single('file'), (req, res) => {
  const store = (req.body.store || '').toUpperCase();
  if (!['VOGUE', 'SNS'].includes(store)) return res.status(400).json({ error: 'Select VOGUE or SNS' });
  if (!req.file) return res.status(400).json({ error: 'Choose M&P Daily XLSX file' });

  const result = mnpService.importDailyXlsx(store, req.file.path, req.file.originalname);
  res.json({ message: `M&P Daily imported. Updated ${result.updated} orders.`, ...result });
});

router.post('/import-payout', authRequired, upload.single('file'), (req, res) => {
  const store = (req.body.store || '').toUpperCase();
  if (!['VOGUE', 'SNS'].includes(store)) return res.status(400).json({ error: 'Select VOGUE or SNS' });
  if (!req.file) return res.status(400).json({ error: 'Choose M&P Payout XLSX file' });

  const result = mnpService.importPayoutXlsx(store, req.file.path, req.file.originalname);
  res.json({ message: `M&P Payout imported. Rows: ${result.rows}.`, ...result });
});

router.post('/sync', authRequired, async (req, res) => {
  const count = await mnpService.syncOrdersWithMnp();
  res.json({ message: `M&P sync done. Updated ${count} orders.`, count });
});

router.post('/auto-import', authRequired, (req, res) => {
  ensureDir(config.files.autoReports);
  ensureDir(config.files.archive);
  const result = mnpService.autoImportReports();
  res.json({ message: 'Auto import completed.', ...result });
});

router.post('/cleanup-payouts', authRequired, (req, res) => {
  const removed = mnpService.cleanupPayouts();
  res.json({ message: `Removed ${removed} duplicate/junk payout rows.`, removed });
});

export default router;
