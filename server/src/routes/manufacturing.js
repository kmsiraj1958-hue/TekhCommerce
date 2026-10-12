import { Router } from 'express';
import { authRequired } from '../middleware/auth.js';
import * as manufacturing from '../services/manufacturingService.js';

const router = Router();
router.use(authRequired);

router.get('/', (req, res) => {
  manufacturing.ensureCpgDemoItems();
  res.json({
    boms: manufacturing.listBoms(),
    production_orders: manufacturing.listProductionOrders(),
    raw: manufacturing.inventoryByType('RAW_MATERIAL'),
    packaging: manufacturing.inventoryByType('PACKAGING_MATERIAL'),
    finished: manufacturing.inventoryByType('FINISHED_GOOD'),
    settings: manufacturing.loadManufacturing().settings,
  });
});

router.get('/boms', (req, res) => {
  res.json({ boms: manufacturing.listBoms() });
});

router.post('/boms', (req, res) => {
  try {
    const bom = manufacturing.saveBom(req.body || {});
    res.status(201).json({ bom });
  } catch (err) {
    res.status(err.status || 400).json({ error: err.message });
  }
});

router.put('/boms/:id', (req, res) => {
  try {
    const bom = manufacturing.saveBom({ ...(req.body || {}), id: req.params.id });
    res.json({ bom });
  } catch (err) {
    res.status(err.status || 400).json({ error: err.message });
  }
});

router.get('/production', (req, res) => {
  res.json({ production_orders: manufacturing.listProductionOrders() });
});

router.post('/production', (req, res) => {
  try {
    const order = manufacturing.createProductionOrder({ ...(req.body || {}), user: req.user?.username });
    res.status(201).json({ order });
  } catch (err) {
    res.status(err.status || 400).json({ error: err.message });
  }
});

router.get('/production/:id', (req, res) => {
  try {
    res.json({ order: manufacturing.getProductionOrder(req.params.id) });
  } catch (err) {
    res.status(err.status || 400).json({ error: err.message });
  }
});

router.patch('/production/:id', (req, res) => {
  try {
    res.json({ order: manufacturing.updateProductionOrder(req.params.id, req.body || {}) });
  } catch (err) {
    res.status(err.status || 400).json({ error: err.message });
  }
});

router.get('/production/:id/preview', (req, res) => {
  try {
    res.json(manufacturing.previewProduction(req.params.id));
  } catch (err) {
    res.status(err.status || 400).json({ error: err.message });
  }
});

router.post('/production/:id/post', (req, res) => {
  try {
    res.json(manufacturing.postProduction(req.params.id, { user: req.user?.username }));
  } catch (err) {
    res.status(err.status || 400).json({ error: err.message });
  }
});

router.post('/production/:id/reverse', (req, res) => {
  try {
    res.json({ order: manufacturing.reverseProduction(req.params.id, { user: req.user?.username }) });
  } catch (err) {
    res.status(err.status || 400).json({ error: err.message });
  }
});

export default router;
