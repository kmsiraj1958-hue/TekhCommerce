import { Router } from 'express';
import { authRequired } from '../middleware/auth.js';
import * as reportService from '../services/reportService.js';
import * as mnpService from '../services/mnpService.js';
import { REPORT_FAMILIES, runReport, reportToCsv } from '../services/reportCentreService.js';
import { loadJson } from '../utils/storage.js';
import { config } from '../config.js';

const router = Router();

router.get('/centre', authRequired, (req, res) => {
  try {
    if (!req.query.family) {
      return res.json({ families: REPORT_FAMILIES });
    }
    const report = runReport(req.query.family, {
      start: req.query.start || '',
      end: req.query.end || '',
      q: req.query.q || '',
      store: req.query.store || '',
    });
    if (String(req.query.format || '') === 'csv') {
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="${req.query.family}.csv"`);
      return res.send(reportToCsv(report));
    }
    res.json(report);
  } catch (err) {
    res.status(err.status || 400).json({ error: err.message });
  }
});

router.get('/master', authRequired, (req, res) => {
  const data = reportService.getMasterReport({
    start: req.query.start,
    end: req.query.end,
    store: req.query.store,
    status: req.query.status,
  });
  res.json(data);
});

router.get('/financial', authRequired, (req, res) => {
  const date = req.query.date || new Date().toISOString().slice(0, 10);
  res.json(reportService.getFinancialReport(date));
});

router.post('/financial/ad-spend', authRequired, (req, res) => {
  const { date, amount } = req.body || {};
  if (!date) return res.status(400).json({ error: 'Date required' });
  const data = reportService.loadAdSpend();
  data[date] = parseFloat(amount) || 0;
  reportService.saveAdSpend(data);
  res.json({ ok: true });
});

router.get('/payout', authRequired, (req, res) => {
  res.json({ payouts: mnpService.loadPayoutRows().reverse() });
});

router.get('/weekly', authRequired, (req, res) => {
  res.json({ reports: reportService.loadWeeklyReports().reverse() });
});

router.post('/weekly/generate', authRequired, (req, res) => {
  const report = reportService.generateWeeklyReport();
  res.json({ report });
});

router.get('/courier-balance', authRequired, (req, res) => {
  const data = mnpService.getCourierBalance({
    storeFilter: (req.query.store || '').toUpperCase(),
    fromDate: req.query.from_date || '',
    toDate: req.query.to_date || '',
  });
  res.json(data);
});

router.get('/imports', authRequired, (req, res) => {
  res.json({ logs: loadJson(config.files.mnpDaily, []).reverse() });
});

export default router;
