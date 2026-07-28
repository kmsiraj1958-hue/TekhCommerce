import express from 'express';
import cors from 'cors';
import path from 'path';
import { config, BASE_DIR } from './config.js';
import authRoutes from './routes/auth.js';
import productRoutes from './routes/products.js';
import orderRoutes from './routes/orders.js';
import webhookRoutes from './routes/webhooks.js';
import inventoryRoutes from './routes/inventory.js';
import reportRoutes from './routes/reports.js';
import { ensureDir } from './utils/storage.js';
import { fileURLToPath } from 'url';
import { setupVendorLicense } from '../../../shared/vendor-license/index.js';
import { setupFinance } from '../../../shared/finance/index.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const app = express();

ensureDir(config.files.uploads);
ensureDir(config.files.images);
ensureDir(config.files.autoReports);
ensureDir(config.files.archive);

app.use(cors({ origin: true, credentials: true }));

app.use('/api/webhooks', express.raw({ type: '*/*' }), (req, res, next) => {
  req.rawBody = req.body;
  try {
    req.body = req.body?.length ? JSON.parse(req.body.toString('utf-8')) : {};
  } catch {
    req.body = {};
  }
  next();
}, webhookRoutes);

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use('/static/images', express.static(config.files.images));
app.use('/uploads', express.static(config.files.uploads));

app.get('/api/health', (req, res) => {
  res.json({ ok: true, name: 'TekhShopify API' });
});

setupVendorLicense(app, express, {
  dataFile: path.join(__dirname, '../data/vendor-license.json'),
  productName: 'TekhShopify',
});

setupFinance(app, express, {
  dataFile: path.join(__dirname, '../data/finance.json'),
});

app.use('/api/auth', authRoutes);
app.use('/api/products', productRoutes);
app.use('/api/orders', orderRoutes);
app.use('/api/inventory', inventoryRoutes);
app.use('/api/reports', reportRoutes);

if (process.env.NODE_ENV === 'production') {
  const clientDist = path.join(BASE_DIR, 'client', 'dist');
  app.use(express.static(clientDist));
  app.get('*', (req, res) => {
    res.sendFile(path.join(clientDist, 'index.html'));
  });
}

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: err.message || 'Server error' });
});

app.listen(config.port, '0.0.0.0', () => {
  console.log(`TekhShopify API running on port ${config.port}`);
});
