import express from 'express';
import cors from 'cors';
import fs from 'fs';
import path from 'path';
import { config, BASE_DIR } from './config.js';
import { assertStartupDataProfile, resolveDataProfile } from './demo/paths.js';
import { BRAND } from './brand.js';
import { pingDatabase } from './db/prisma.js';
import { authRequired } from './middleware/auth.js';
import { publicDemoWriteLimit } from './middleware/demoRateLimit.js';
import authRoutes from './routes/auth.js';
import productRoutes from './routes/products.js';
import orderRoutes from './routes/orders.js';
import webhookRoutes from './routes/webhooks.js';
import inventoryRoutes from './routes/inventory.js';
import reportRoutes from './routes/reports.js';
import courierRoutes from './routes/courier.js';
import invoiceRoutes from './routes/invoices.js';
import documentRoutes from './routes/documents.js';
import manufacturingRoutes from './routes/manufacturing.js';
import onboardingRoutes from './routes/onboarding.js';
import { ensureDir } from './utils/storage.js';
import { writeDemoDataset } from './demo/writeDemoDataset.js';
import { fileURLToPath } from 'url';
import { setupVendorLicense } from '../../../shared/vendor-license/index.js';
import { createFinanceRouter, ensureFinanceFile } from '../../../shared/finance/index.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

assertStartupDataProfile(
  resolveDataProfile({
    nodeEnv: process.env.NODE_ENV,
    tekhData: process.env.TEKH_DATA,
    useLiveJson: process.env.USE_LIVE_JSON,
    publicDemo: process.env.TEKH_PUBLIC_DEMO,
  }),
  {
    nodeEnv: process.env.NODE_ENV,
    tekhData: process.env.TEKH_DATA,
    publicDemo: process.env.TEKH_PUBLIC_DEMO,
  },
);

const app = express();

if (config.useDevelopmentData) {
  writeDemoDataset({ force: config.publicDemo || process.env.DEV_DATA_RESEED === 'true' });
  console.log(config.publicDemo
    ? 'TekhCommerce public demo: synthetic server/data/demo only. Live JSON is unused.'
    : 'TekhCommerce local data: server/data/demo (live JSON is unused).');
}

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

if (config.publicDemo) {
  app.set('trust proxy', 1);
  app.use(publicDemoWriteLimit);
}

app.use('/static/images', express.static(config.files.images));
app.use('/uploads', express.static(config.files.uploads));

app.get('/api/health', async (req, res) => {
  const database = await pingDatabase();
  res.json({
    ok: true,
    name: BRAND.apiName,
    canonicalStack: config.canonicalStack,
    sourceOfTruth: config.sourceOfTruth,
    flask: 'frozen-legacy',
    dataProfile: config.dataProfile,
    publicDemo: config.publicDemo,
    database,
  });
});

app.get('/api/runtime', (req, res) => {
  res.json({
    dataProfile: config.dataProfile,
    sourceOfTruth: config.sourceOfTruth,
  });
});

const vendorLicenseFile = config.publicDemo
  ? path.join(BASE_DIR, 'server', 'data', 'demo', 'vendor-license.json')
  : path.join(__dirname, '../data/vendor-license.json');
if (config.publicDemo) {
  ensureDir(path.dirname(vendorLicenseFile));
  fs.writeFileSync(vendorLicenseFile, JSON.stringify({
    productName: BRAND.name,
    nextDueDate: null,
    graceDays: 4,
    noticeDaysBefore: 7,
    billingCycleDays: 30,
    amount: 0,
    currency: 'USD',
    contactEmail: 'billing@tekhtalent.com',
    contactPhone: '',
    lastPaidAt: null,
    clientName: 'Public demo',
  }, null, 2));
}
setupVendorLicense(app, express, {
  dataFile: vendorLicenseFile,
  productName: BRAND.name,
});

const financeFile = config.files.finance;
ensureFinanceFile(financeFile);
app.use('/api/finance', authRequired, createFinanceRouter(express, { filePath: financeFile }));

app.use('/api/auth', authRoutes);
app.use('/api/products', productRoutes);
app.use('/api/orders', orderRoutes);
app.use('/api/inventory', inventoryRoutes);
app.use('/api/reports', reportRoutes);
app.use('/api/courier', courierRoutes);
app.use('/api/invoices', invoiceRoutes);
app.use('/api/documents', documentRoutes);
app.use('/api/manufacturing', manufacturingRoutes);
app.use('/api/onboarding', onboardingRoutes);

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
  console.log(`${BRAND.apiName} running on port ${config.port} [${config.dataProfile} data]`);
});
