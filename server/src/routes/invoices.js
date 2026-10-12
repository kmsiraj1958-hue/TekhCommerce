import { Router } from 'express';
import { authRequired } from '../middleware/auth.js';
import * as invoiceService from '../services/invoiceService.js';
import { config } from '../config.js';

const router = Router();
router.use(authRequired);

router.get('/', (req, res) => {
  res.json({
    invoices: invoiceService.listInvoices(),
    dataProfile: config.dataProfile,
  });
});

router.get('/:id', (req, res) => {
  const invoice = invoiceService.getInvoice(req.params.id);
  if (!invoice) return res.status(404).json({ error: 'Invoice not found' });
  res.json({ invoice, dataProfile: config.dataProfile });
});

export default router;
