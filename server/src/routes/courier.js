import { Router } from 'express';
import path from 'path';
import multer from 'multer';
import { authRequired } from '../middleware/auth.js';
import { config } from '../config.js';
import * as courierService from '../services/courierService.js';
import * as mnpService from '../services/mnpService.js';

const router = Router();
const upload = multer({ dest: path.join(config.files.uploads, 'tmp') });

router.use(authRequired);

router.get('/accounts', (req, res) => {
  res.json(courierService.getOverview());
});

router.get('/shipments', (req, res) => {
  res.json(courierService.getShipments({
    search: req.query.search || '',
    store: req.query.store || '',
    status: req.query.status || '',
    courier: req.query.courier || '',
  }));
});

router.get('/returns', (req, res) => {
  res.json(courierService.getReturns());
});

router.post('/returns/:orderId/receive', (req, res) => {
  try {
    const receipt = courierService.receiveReturn({
      orderId: req.params.orderId,
      tracking: req.body.tracking,
      condition: req.body.condition,
      qty: req.body.qty,
      notes: req.body.notes,
      receivedAt: req.body.received_at,
      user: req.user?.username,
    });
    res.status(201).json({ receipt });
  } catch (err) {
    res.status(err.statusCode || 400).json({ error: err.message });
  }
});

router.get('/reconciliation', (req, res) => {
  res.json(courierService.getReconciliation({
    start: req.query.start || '',
    end: req.query.end || '',
  }));
});

router.get('/weekly', (req, res) => {
  try {
    const report = courierService.getWeekly({
      start: req.query.start,
      end: req.query.end,
      store: req.query.store || '',
      save: req.query.save === '1',
      confirm: req.query.confirm === '1',
    });
    if (req.query.format === 'csv') {
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', 'attachment; filename="courier-weekly.csv"');
      return res.send(courierService.weeklyToCsv(report));
    }
    res.json(report);
  } catch (err) {
    res.status(err.statusCode || 400).json({ error: err.message });
  }
});

router.get('/alerts', (req, res) => {
  res.json(courierService.getAlerts());
});

router.get('/settings', (req, res) => {
  res.json(courierService.loadSettings());
});

router.put('/settings', (req, res) => {
  res.json(courierService.saveSettings(req.body || {}));
});

router.post('/sync', async (req, res) => {
  const result = await courierService.syncCourier();
  res.json({ message: `M&P sync done. Updated ${result.count} orders.`, ...result });
});

router.post('/import-daily/preview', upload.single('file'), (req, res) => {
  const store = (req.body.store || '').toUpperCase();
  if (!['VOGUE', 'SNS'].includes(store)) return res.status(400).json({ error: 'Select VOGUE or SNS' });
  if (!req.file) return res.status(400).json({ error: 'Choose M&P Daily XLSX file' });
  res.json(courierService.previewDailyImport(store, req.file.path));
});

router.post('/import-daily/apply', upload.single('file'), (req, res) => {
  const store = (req.body.store || '').toUpperCase();
  if (!['VOGUE', 'SNS'].includes(store)) return res.status(400).json({ error: 'Select VOGUE or SNS' });
  if (!req.file) return res.status(400).json({ error: 'Choose M&P Daily XLSX file' });
  const result = mnpService.importDailyXlsx(store, req.file.path, req.file.originalname);
  res.json({ message: `M&P Daily imported. Updated ${result.updated} orders.`, ...result });
});

router.post('/import-payout/apply', upload.single('file'), (req, res) => {
  const store = (req.body.store || '').toUpperCase();
  if (!['VOGUE', 'SNS'].includes(store)) return res.status(400).json({ error: 'Select VOGUE or SNS' });
  if (!req.file) return res.status(400).json({ error: 'Choose M&P Payout XLSX file' });
  const result = mnpService.importPayoutXlsx(store, req.file.path, req.file.originalname);
  res.json({ message: `M&P Payout imported. Rows: ${result.rows}.`, ...result });
});

export default router;
